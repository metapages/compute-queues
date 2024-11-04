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

data "project_id" "this" {}

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

module "gce-container" {
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
        container_port = 8080
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
  source_image         = reverse(split("/", module.gce-container.source_image))[0]
  metadata = {
    "google-logging-enabled"    = "true"
    "gce-container-declaration" = module.gce-container.metadata_value
  }
  tags = [
    "worker"
  ]
  labels = {
    "container-vm" = module.gce-container.vm_container_label
  }
}

module "mig" {
  source            = "terraform-google-modules/vm/google//modules/mig"
  version           = "~> 12.1.0"
  instance_template = module.mig_template.self_link
  region            = var.region
  hostname          = "worker"
  target_size       = 2

  # distribution_policy_zones = ["us-central1-a"]
  named_ports = [
    {
      name = "http",
      port = 8080
    },
    {
      name = "ssh",
      port = 22
    }
  ]
}

module "opentelemetry_service_account" {
  source     = "terraform-google-modules/service-accounts/google"
  version    = "~> 4.2"
  project_id = data.project_id.this
  prefix     = "worker"
  names      = ["opentelemetry"]
}

module "opentelemetry_cloud_run" {
  source  = "GoogleCloudPlatform/cloud-run/google"
  version = "~> 0.12"

  service_name          = "opentelemetry"
  project_id            = data.project_id.this
  location              = var.region
  image                 = "otel/opentelemetry-collector:0.112.0"
  service_account_email = module.service_account.email
}
