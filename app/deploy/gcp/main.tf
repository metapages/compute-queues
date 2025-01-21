## Enable the various GCP APIs that this infra uses

resource "google_project_service" "compute" {
  service                    = "compute.googleapis.com"
  disable_dependent_services = true
  disable_on_destroy         = false
}

resource "google_project_service" "iam" {
  service                    = "iam.googleapis.com"
  disable_dependent_services = true
  disable_on_destroy         = false
}

resource "google_project_service" "cloud_monitoring" {
  service                    = "monitoring.googleapis.com"
  disable_dependent_services = true
  disable_on_destroy         = false
}

resource "google_project_service" "cloud_logging" {
  service                    = "logging.googleapis.com"
  disable_dependent_services = true
  disable_on_destroy         = false
}

resource "google_project_service" "cloud_run" {
  service                    = "run.googleapis.com"
  disable_dependent_services = true
  disable_on_destroy         = false
}

resource "google_project_service" "cloud_trace" {
  service                    = "cloudtrace.googleapis.com"
  disable_dependent_services = true
  disable_on_destroy         = false
}

resource "google_project_service" "dns" {
  service                    = "dns.googleapis.com"
  disable_dependent_services = true
  disable_on_destroy         = false
}

locals {
  queue_metrics_path = "metrics"
  opentelemetry_scrape_jobs = join("", [
    for key, value in var.worker_groups : <<EOF
      - job_name: '${key}-queue-metrics'
        metrics_path: '/${value.queue_id}/${local.queue_metrics_path}'
        scheme: https
        static_configs:
          - targets: ["container.mtfm.io"]
EOF
  ])
  opentelemetry_config = <<EOF
receivers:
  prometheus:
    config:
      scrape_configs:
${local.opentelemetry_scrape_jobs}
processors:
  metricstransform:
    transforms:
      - include: queue_length
        action: update
        operations:
          - action: toggle_scalar_data_type
  memory_limiter:
    check_interval: 1s
    limit_percentage: 80
exporters:
  googlecloud:
    metric:
      prefix: custom.googleapis.com/opentelemetry/
service:
  pipelines:
    metrics:
      receivers: [prometheus]
      processors: [memory_limiter, metricstransform]
      exporters: [googlecloud]
EOF
}

# data "google_project" "this" {}

data "google_compute_network" "default" {
  name = "default"
}

data "google_compute_subnetwork" "default" {
  name   = "default"
  region = var.region
}

resource "google_service_account" "mig_template_creator" {
  account_id   = "mig-template-creator"
  display_name = "Service account for creating mig templates from Terraform"
}

resource "google_compute_router" "this" {
  name    = "worker"
  network = data.google_compute_network.default.self_link
  region  = var.region
}

resource "google_compute_router_nat" "this" {
  name                               = "worker"
  router                             = google_compute_router.this.name
  region                             = google_compute_router.this.region
  nat_ip_allocate_option             = "AUTO_ONLY"
  source_subnetwork_ip_ranges_to_nat = "ALL_SUBNETWORKS_ALL_IP_RANGES"
}

module "worker_vm" {
  for_each = var.worker_groups
  source   = "terraform-google-modules/container-vm/google"
  version  = "~> 3.2"

  container = {
    image = var.worker_image
    env = [
      {
        name  = "METAPAGE_IO_GENERATE_WORKER_ID"
        value = true
      },
      {
        name  = "METAPAGE_IO_WORKER_CPUS"
        value = each.value.cpus
      },
      {
        name  = "METAPAGE_IO_WORKER_GPUS"
        value = each.value.gpus != null ? each.value.gpus.count : 0
      },
      {
        name  = "METAPAGE_IO_QUEUE_ID"
        value = each.value.queue_id
      }
    ]
    securityContext = {
      privileged : true
    }
    tty : true
    volumeMounts = [
      {
        mountPath = "/var/run/docker.sock"
        name      = "docker-socket"
        readOnly  = true
      }
    ]
  }

  volumes = [
    {
      name = "docker-socket"
      hostPath = {
        path = "/var/run/docker.sock"
      }
    }
  ]

  restart_policy = "Always"
}

module "mig_template" {
  for_each             = var.worker_groups
  source               = "terraform-google-modules/vm/google//modules/instance_template"
  version              = "~> 12.1.0"
  name_prefix          = "worker-${each.key}-"
  source_image_family  = "cos-stable"
  source_image_project = "cos-cloud"
  source_image         = reverse(split("/", module.worker_vm[each.key].source_image))[0]
  machine_type         = each.value.instance_type
  preemptible          = true
  network              = data.google_compute_network.default.self_link
  subnetwork           = data.google_compute_subnetwork.default.self_link

  gpu = startswith(each.value.instance_type, "n1") && each.value.gpus != null ? {
    count = each.value.gpus.count
    type  = each.value.gpus.type
  } : null

  service_account = {
    email  = google_service_account.mig_template_creator.email
    scopes = ["cloud-platform"]
  }

  metadata = {
    "google-logging-enabled"    = "true"
    "gce-container-declaration" = module.worker_vm[each.key].metadata_value
  }

  tags = [
    "worker"
  ]

  labels = {
    "container-vm" = module.worker_vm[each.key].vm_container_label
  }
}

module "mig" {
  for_each          = var.worker_groups
  source            = "terraform-google-modules/vm/google//modules/mig"
  version           = "~> 12.1.0"
  instance_template = module.mig_template[each.key].self_link
  region            = var.region
  hostname          = each.key
  target_size       = 1

  distribution_policy_zones = ["${var.region}-a"]
  named_ports = [
    {
      name = "ssh",
      port = 22
    }
  ]
}

resource "google_compute_region_autoscaler" "this" {
  for_each = var.worker_groups
  provider = google-beta
  name     = each.key
  region   = var.region
  target   = module.mig[each.key].instance_group_manager.id
  autoscaling_policy {
    max_replicas    = each.value.max_workers
    min_replicas    = each.value.min_workers
    cooldown_period = 30
    metric {
      name                       = "custom.googleapis.com/opentelemetry/queue_length"
      filter                     = "resource.type = \"generic_task\" AND resource.label.job = \"${each.key}-queue-metrics\""
      single_instance_assignment = each.value.cpus
    }
  }
}

module "metrics_container" {
  source  = "terraform-google-modules/container-vm/google"
  version = "~> 3.2"

  container = {
    image = var.opentelemetry_collector_image
    tty : true
    env = [
      {
        "name"  = "OTEL_YAML_CONFIG"
        "value" = local.opentelemetry_config
      },
      {
        "name"  = "OTEL_RESOURCE_ATTRIBUTES"
        "value" = "cloud.region=${var.region}"
      }
    ]
    args = ["--config=env:OTEL_YAML_CONFIG"]
  }

  restart_policy = "Always"
}

data "google_compute_default_service_account" "default" {}

resource "google_compute_instance" "metrics" {
  name         = "metrics-collector"
  machine_type = "e2-micro"
  zone         = "${var.region}-a"

  boot_disk {
    initialize_params {
      image = module.metrics_container.source_image
    }
  }

  network_interface {
    network = "default"
  }

  tags = ["metrics"]

  metadata = {
    gce-container-declaration = module.metrics_container.metadata_value
  }

  labels = {
    container-vm = module.metrics_container.vm_container_label
  }

  service_account {
    email = data.google_compute_default_service_account.default.email
    scopes = [
      "https://www.googleapis.com/auth/cloud-platform",
    ]
  }
}
