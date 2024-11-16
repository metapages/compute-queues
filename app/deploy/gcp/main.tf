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
  # IP ranges used by GCE internal application load balancer, according to https://cloud.google.com/load-balancing/docs/health-check-concepts#ip-ranges
  gce_health_check_ip_ranges = [
    "35.191.0.0/16",
    "130.211.0.0/22"
  ]
  opentelemetry_scrape_targets = join(", ", [for key, value in var.worker_groups : "'${key}.workers.internal'"])
  opentelemetry_config         = <<EOF
receivers:
  prometheus:
    config:
      scrape_configs:
        - job_name: 'collect-worker-metrics'
          metrics_path: '/metrics'
          scheme: http
          static_configs:
            - targets: [${local.opentelemetry_scrape_targets}]
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
        name  = "METAPAGE_WORKER_CPUS"
        value = each.value.cpus
      },
      {
        name  = "METAPAGE_QUEUE_ID"
        value = each.value.queue_id
      }
    ]
    securityContext = {
      privileged : true
    }
    tty : true
    ports = [
      {
        name           = "http"
        container_port = 8000
      }
    ]
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
  for_each   = var.worker_groups
  source     = "terraform-google-modules/vm/google//modules/instance_template"
  version    = "~> 12.1.0"
  network    = data.google_compute_network.default.self_link
  subnetwork = data.google_compute_subnetwork.default.self_link
  service_account = {
    email  = google_service_account.mig_template_creator.email
    scopes = ["cloud-platform"]
  }
  name_prefix          = "worker-${each.key}-"
  preemptible          = true
  source_image_family  = "cos-stable"
  source_image_project = "cos-cloud"
  source_image         = reverse(split("/", module.worker_vm[each.key].source_image))[0]
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

  distribution_policy_zones = ["us-central1-a"]
  named_ports = [
    {
      name = "http",
      port = 8000
    },
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
    max_replicas    = 10
    min_replicas    = 1
    cooldown_period = 15
    metric {
      name                       = "custom.googleapis.com/opentelemetry/queue_length"
      filter                     = "resource.type = \"generic_task\" AND resource.label.task_id = \"${each.key}.workers.internal:80\""
      single_instance_assignment = 1
    }
  }
}

resource "google_compute_region_backend_service" "this" {
  for_each              = var.worker_groups
  name                  = each.key
  region                = var.region
  protocol              = "HTTP"
  load_balancing_scheme = "INTERNAL_MANAGED"
  timeout_sec           = 10
  health_checks         = [google_compute_region_health_check.this.id]
  backend {
    group           = module.mig[each.key].instance_group
    balancing_mode  = "UTILIZATION"
    capacity_scaler = 1.0
  }
}

resource "google_compute_region_url_map" "this" {
  name   = "metrics-to-mig"
  region = var.region

  default_url_redirect {
    https_redirect         = false
    redirect_response_code = "TEMPORARY_REDIRECT"
    host_redirect          = "nonexistent.workers.internal"
    path_redirect          = "/404"
    strip_query            = false
  }

  dynamic "host_rule" {
    for_each = var.worker_groups
    content {
      hosts        = ["${host_rule.key}.workers.internal"]
      path_matcher = host_rule.key
    }
  }

  dynamic "host_rule" {
    for_each = var.worker_groups
    content {
      hosts        = ["${host_rule.key}.workers.internal:80"]
      path_matcher = host_rule.key
    }
  }

  dynamic "path_matcher" {
    for_each = var.worker_groups
    content {
      name            = path_matcher.key
      default_service = google_compute_region_backend_service.this[path_matcher.key].id
      path_rule {
        paths   = ["/"]
        service = google_compute_region_backend_service.this[path_matcher.key].id
      }
    }
  }
}

resource "google_compute_subnetwork" "ilb_proxy" {
  name          = "ilb-proxy"
  region        = var.region
  network       = data.google_compute_network.default.self_link
  ip_cidr_range = "10.10.0.0/24"
  purpose       = "INTERNAL_HTTPS_LOAD_BALANCER"
  role          = "ACTIVE"
}

# Allow traffic from the GCE internal application load balancer to the worker MIGs
resource "google_compute_firewall" "ilb" {
  name    = "ilb-proxy"
  network = data.google_compute_network.default.self_link
  allow {
    protocol = "tcp"
    ports    = ["8000"]
  }
  source_ranges = ["10.10.0.0/24"]
  target_tags   = ["worker"]
}

# Allow traffic from GCE health probes to the worker MIGs
resource "google_compute_firewall" "ilb_health_check" {
  name    = "ilb-health-checks"
  network = data.google_compute_network.default.self_link
  allow {
    protocol = "tcp"
    ports    = ["8000"]
  }
  source_ranges = local.gce_health_check_ip_ranges
  target_tags   = ["worker"]
}

resource "google_compute_region_health_check" "this" {
  name               = "worker"
  region             = var.region
  check_interval_sec = 10
  timeout_sec        = 10
  http_health_check {
    port         = 8000
    request_path = "/metrics"
  }
}

resource "google_compute_region_target_http_proxy" "this" {
  name    = "metrics-to-mig"
  region  = var.region
  url_map = google_compute_region_url_map.this.id
}

resource "google_compute_forwarding_rule" "this" {
  name                  = "metrics-to-mig"
  region                = var.region
  depends_on            = [data.google_compute_subnetwork.default]
  ip_protocol           = "TCP"
  load_balancing_scheme = "INTERNAL_MANAGED"
  port_range            = "80"
  target                = google_compute_region_target_http_proxy.this.id
  network               = data.google_compute_network.default.id
  subnetwork            = data.google_compute_subnetwork.default.id
  network_tier          = "PREMIUM"
}

resource "google_dns_managed_zone" "workers" {
  name        = "workers"
  dns_name    = "workers.internal."
  description = "Internal DNS hostname for all worker MIGs"

  visibility = "private"

  private_visibility_config {
    networks {
      network_url = data.google_compute_network.default.id
    }
  }
}

resource "google_dns_record_set" "workers" {
  name         = "*.workers.internal."
  type         = "A"
  ttl          = 300
  managed_zone = google_dns_managed_zone.workers.name
  rrdatas      = [google_compute_forwarding_rule.this.ip_address]
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
  zone         = "us-central1-a"

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
