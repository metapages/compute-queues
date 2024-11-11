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

locals {
  # IP ranges used by GCE internal application load balancer, according to https://cloud.google.com/load-balancing/docs/health-check-concepts#ip-ranges
  gce_health_check_ip_ranges = [
    "35.191.0.0/16",
    "130.211.0.0/22"
  ]
  opentelemetry_config = <<EOF
receivers:
  prometheus:
    config:
      scrape_configs:
        - job_name: 'collect-worker-metrics'
          metrics_path: '/metrics'
          static_configs:
            - targets: ['${google_compute_forwarding_rule.this.ip_address}:8000']
exporters:
  googlecloud:
    metric:
      prefix: custom.googleapis.com/opentelemetry/
processors:
  memory_limiter:
    check_interval: 1s
    limit_percentage: 80
  batch:
service:
  pipelines:
    metrics:
      receivers: [prometheus]
      processors: [memory_limiter, batch]
      exporters: [googlecloud]
EOF
  # opentelemetry_config_base64 = base64encode(local.opentelemetry_config)
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
  source  = "terraform-google-modules/container-vm/google"
  version = "~> 3.2"

  container = {
    image = var.worker_image
    env = [
      {
        name  = "METAPAGE_WORKER_CPUS"
        value = "1"
      },
      {
        name  = "METAPAGE_QUEUE_ID"
        value = var.queue_id
      },
      # {
      #   name  = "METAPAGE_GENERATE_WORKER_ID"
      #   value = "true"
      # }
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
  source     = "terraform-google-modules/vm/google//modules/instance_template"
  version    = "~> 12.1.0"
  network    = data.google_compute_network.default.self_link
  subnetwork = data.google_compute_subnetwork.default.self_link
  service_account = {
    email  = google_service_account.mig_template_creator.email
    scopes = ["cloud-platform"]
  }
  name_prefix          = "worker-"
  preemptible          = true
  source_image_family  = "cos-stable"
  source_image_project = "cos-cloud"
  source_image         = reverse(split("/", module.worker_vm.source_image))[0]
  metadata = {
    "google-logging-enabled"    = "true"
    "gce-container-declaration" = module.worker_vm.metadata_value
  }
  tags = [
    "worker"
  ]
  labels = {
    "container-vm" = module.worker_vm.vm_container_label
  }
}

module "mig" {
  source            = "terraform-google-modules/vm/google//modules/mig"
  version           = "~> 12.1.0"
  instance_template = module.mig_template.self_link
  region            = var.region
  hostname          = "worker"
  target_size       = 1

  # distribution_policy_zones = ["us-central1-a"]
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
      }
    ]
    args = ["--config=env:OTEL_YAML_CONFIG"]
  }

  restart_policy = "Always"
}

data "google_compute_default_service_account" "default" {}

resource "google_compute_instance" "metrics" {
  name         = "metrics-collector"
  machine_type = "e2-medium"
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

# All of the below, as well as the worker MIG definition itself, should probably go into a module
# we can call multiple times to get multiple worker configurations deployed.

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

resource "google_compute_region_backend_service" "this" {
  name                  = "metrics-to-mig"
  region                = var.region
  protocol              = "HTTP"
  load_balancing_scheme = "INTERNAL_MANAGED"
  timeout_sec           = 10
  health_checks         = [google_compute_region_health_check.this.id]
  backend {
    group           = module.mig.instance_group
    balancing_mode  = "UTILIZATION"
    capacity_scaler = 1.0
  }
}

resource "google_compute_region_url_map" "this" {
  name            = "metrics-to-mig"
  region          = var.region
  default_service = google_compute_region_backend_service.this.id
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
  port_range            = "8000"
  target                = google_compute_region_target_http_proxy.this.id
  network               = data.google_compute_network.default.id
  subnetwork            = data.google_compute_subnetwork.default.id
  network_tier          = "PREMIUM"
}
