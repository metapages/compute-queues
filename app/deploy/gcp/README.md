# Compute Workers on GCP

Infrastructure code to create horizontally scaling Metapage worker deployments on Google Cloud Platform.

## Basic Usage

This worker infrastructure uses [terraform](https://www.terraform.io/) to create resources in GCP. You need a GCP project and administrative privileges within that project to create the resources defined here. Google provides [documentation](https://cloud.google.com/docs/terraform/authentication) on how to authenticate terraform with GCP, which you'll need to follow before executing the below.

1. `terraform init` to initialize the module and its dependencies
2. `terraform plan -out plan.out` to generate a plan of the exact changes that will be performed (the plan name is arbitrary)
3. `terraform apply plan.out` to apply the plan
4. `terraform destroy` to tear down the infrastructure

## Design

This module deploys metapage workers as one or more [Managed Instance Groups](https://cloud.google.com/compute/docs/instance-groups) (MIGs) in GCP. The MIGs which should be created are defined via the `worker_groups` variable. Each MIG is assigned a job queue ID as part of its definition, and autoscales based on the `queue_length` Prometheus-style metric its own workers expose at the `/metrics` endpoint. This means as more jobs are added to the job queue, the MIG will automatically scale up to handle the increased load. As the number of unfinished jobs decreases, the MIG will conservatively scale in to save costs.

Since the metrics to determine scaling are served from the workers themselves, and we can't always be sure of any particular worker being online to request metrics from, we place an [Internal Load Balancer](https://cloud.google.com/load-balancing/docs/l7-internal) in front of the MIGs. We then use a separate instance for metric collection, which runs an [OpenTelemetry collector](https://opentelemetry.io/docs/collector/) to continually scrape metrics from the workers and export them to [Google Cloud Monitoring](https://cloud.google.com/monitoring/custom-metrics).

The module supports the creation of worker groups [with GPUs](https://cloud.google.com/compute/docs/gpus), by providing a definition with *either* N1-series instances and a populated `gpus` block, or accelerator-optimized instances with no `gpus` block included.

Workers are currently scaled under the assumption that 1 CPU core should handle 1 job off the queue, so a VM with 4 CPUs will pull 4 jobs off the queue before the autoscaler decides it needs more worker VMs.

## Gotchas

There are some quirks and things to be careful about when operating this module.

- Both the workers and the metrics collector run containers defined using [GCE instance metadata](https://cloud.google.com/compute/docs/containers/deploying-containers). Updating the container image/VM metadata will not automatically result in applied changes to the running VM, so you may need to have the MIG restart/recreate instances to fully apply changes right now.
- When the queue is getting a lot of jobs added & removed, different MIG members may report different metrics for `queue_length`, and can continue reporting that there are unfinished jobs in the queue even after the queue is empty for a little while -- however, this will gradually fall off and the MIG *will* eventually scale in, so don't be concerned if it looks "stuck" at a higher than necessary scale for a couple minutes. MIG autoscaling is by default rather conservative to prevent thrashing and yo-yoing of instances.
- There are a number of failure points in the process required to autoscale the MIGs for our case, and those failures can happen silently. Ideally we build a dashboard in Cloud Monitoring to get a view of our system at a glance, but this doesn't include one yet. Places to check for failures include: 1) the /metrics endpoints on the MIG instance containers, 2) connectivity to request metrics from MIG instances from the metrics collector (especially load balancer, DNS, etc configuration), and 3) the metrics collector itself which processes and exports to Cloud Monitoring.
- This module enables a number of Google APIs, and does *not* disable them or destroy the project when `terraform destroy` is run. If you want to be sure everything is torn down, you should delete your project manually in the GCP console.
- The worker groups in this module don't yet scale to zero, so be careful about running expensive instance types -- especially if scaling limits are high! If there's any condition that causes the worker group to remain scaled out, you could be in for a nice surprise bill from GCP.
- Worker MIGs are currently zonal, meaning they're confined to a single zone in the deployed region. This leaves them more vulnerable to zonal outages.

# Terraform Module

## Requirements

| Name | Version |
|------|---------|
| <a name="requirement_terraform"></a> [terraform](#requirement\_terraform) | ~> 1.9.5 |
| <a name="requirement_google"></a> [google](#requirement\_google) | ~> 6.7.0 |
| <a name="requirement_google-beta"></a> [google-beta](#requirement\_google-beta) | ~> 6.10 |

## Providers

| Name | Version |
|------|---------|
| <a name="provider_google"></a> [google](#provider\_google) | 6.7.0 |
| <a name="provider_google-beta"></a> [google-beta](#provider\_google-beta) | 6.10.0 |

## Modules

| Name | Source | Version |
|------|--------|---------|
| <a name="module_metrics_container"></a> [metrics\_container](#module\_metrics\_container) | terraform-google-modules/container-vm/google | ~> 3.2 |
| <a name="module_mig"></a> [mig](#module\_mig) | terraform-google-modules/vm/google//modules/mig | ~> 12.1.0 |
| <a name="module_mig_template"></a> [mig\_template](#module\_mig\_template) | terraform-google-modules/vm/google//modules/instance_template | ~> 12.1.0 |
| <a name="module_worker_vm"></a> [worker\_vm](#module\_worker\_vm) | terraform-google-modules/container-vm/google | ~> 3.2 |

## Resources

| Name | Type |
|------|------|
| [google-beta_google_compute_region_autoscaler.this](https://registry.terraform.io/providers/hashicorp/google-beta/latest/docs/resources/google_compute_region_autoscaler) | resource |
| [google_compute_firewall.ilb](https://registry.terraform.io/providers/hashicorp/google/latest/docs/resources/compute_firewall) | resource |
| [google_compute_firewall.ilb_health_check](https://registry.terraform.io/providers/hashicorp/google/latest/docs/resources/compute_firewall) | resource |
| [google_compute_forwarding_rule.this](https://registry.terraform.io/providers/hashicorp/google/latest/docs/resources/compute_forwarding_rule) | resource |
| [google_compute_instance.metrics](https://registry.terraform.io/providers/hashicorp/google/latest/docs/resources/compute_instance) | resource |
| [google_compute_region_backend_service.this](https://registry.terraform.io/providers/hashicorp/google/latest/docs/resources/compute_region_backend_service) | resource |
| [google_compute_region_health_check.this](https://registry.terraform.io/providers/hashicorp/google/latest/docs/resources/compute_region_health_check) | resource |
| [google_compute_region_target_http_proxy.this](https://registry.terraform.io/providers/hashicorp/google/latest/docs/resources/compute_region_target_http_proxy) | resource |
| [google_compute_region_url_map.this](https://registry.terraform.io/providers/hashicorp/google/latest/docs/resources/compute_region_url_map) | resource |
| [google_compute_router.this](https://registry.terraform.io/providers/hashicorp/google/latest/docs/resources/compute_router) | resource |
| [google_compute_router_nat.this](https://registry.terraform.io/providers/hashicorp/google/latest/docs/resources/compute_router_nat) | resource |
| [google_compute_subnetwork.ilb_proxy](https://registry.terraform.io/providers/hashicorp/google/latest/docs/resources/compute_subnetwork) | resource |
| [google_dns_managed_zone.workers](https://registry.terraform.io/providers/hashicorp/google/latest/docs/resources/dns_managed_zone) | resource |
| [google_dns_record_set.workers](https://registry.terraform.io/providers/hashicorp/google/latest/docs/resources/dns_record_set) | resource |
| [google_project_service.cloud_logging](https://registry.terraform.io/providers/hashicorp/google/latest/docs/resources/project_service) | resource |
| [google_project_service.cloud_monitoring](https://registry.terraform.io/providers/hashicorp/google/latest/docs/resources/project_service) | resource |
| [google_project_service.cloud_run](https://registry.terraform.io/providers/hashicorp/google/latest/docs/resources/project_service) | resource |
| [google_project_service.cloud_trace](https://registry.terraform.io/providers/hashicorp/google/latest/docs/resources/project_service) | resource |
| [google_project_service.compute](https://registry.terraform.io/providers/hashicorp/google/latest/docs/resources/project_service) | resource |
| [google_project_service.dns](https://registry.terraform.io/providers/hashicorp/google/latest/docs/resources/project_service) | resource |
| [google_project_service.iam](https://registry.terraform.io/providers/hashicorp/google/latest/docs/resources/project_service) | resource |
| [google_service_account.mig_template_creator](https://registry.terraform.io/providers/hashicorp/google/latest/docs/resources/service_account) | resource |
| [google_compute_default_service_account.default](https://registry.terraform.io/providers/hashicorp/google/latest/docs/data-sources/compute_default_service_account) | data source |
| [google_compute_network.default](https://registry.terraform.io/providers/hashicorp/google/latest/docs/data-sources/compute_network) | data source |
| [google_compute_subnetwork.default](https://registry.terraform.io/providers/hashicorp/google/latest/docs/data-sources/compute_subnetwork) | data source |

## Inputs

| Name | Description | Type | Default | Required |
|------|-------------|------|---------|:--------:|
| <a name="input_opentelemetry_collector_image"></a> [opentelemetry\_collector\_image](#input\_opentelemetry\_collector\_image) | Address of the container image to use for the OpenTelemetry Collector | `string` | n/a | yes |
| <a name="input_queue_id"></a> [queue\_id](#input\_queue\_id) | The queue id for the worker | `string` | n/a | yes |
| <a name="input_region"></a> [region](#input\_region) | The region in which we're rolling out IaC | `string` | n/a | yes |
| <a name="input_worker_groups"></a> [worker\_groups](#input\_worker\_groups) | Definitions of autoscaling worker groups to create. Map key will be used as the name of the worker group, so make sure it's DNS-friendly (no spaces, incompatible special characters, etc. The 'gpus' block is only appropriate for N1 series VMs with attached GPUs. If any other instance type is specified (like accelerator-optimized VMs), the 'gpus' block will be ignored.) | <pre>map(object({<br/>    queue_id      = string<br/>    instance_type = string<br/>    cpus          = number<br/>    gpus = optional(object({<br/>      count = number<br/>      type  = string<br/>    }))<br/>  }))</pre> | n/a | yes |
| <a name="input_worker_image"></a> [worker\_image](#input\_worker\_image) | Address of the container image to use for the worker | `string` | n/a | yes |

## Outputs

No outputs.
