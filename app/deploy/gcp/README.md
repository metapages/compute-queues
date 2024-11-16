# Compute providers

**WIP**: This is a work in progress and still needs some cleanup before it's production-ready. It is usable though.

https://www.notion.so/metapages/Metapage-compute-worker-providers-0913a04cd3784c569dfa374bc91e0bea?pvs=4

Infrastructure code for cloud providers to create horizontally scaling workers.

## Basic Usage

This worker infrastructure uses [terraform](https://www.terraform.io/) to create resources in GCP. You need a GCP project and administrative privileges within that project to create the resources defined here. Google provides [documentation](https://cloud.google.com/docs/terraform/authentication) on how to authenticate terraform with GCP, which you'll need to follow before executing the below.

1. `terraform init` to initialize the module and its dependencies
2. `terraform plan -out plan.out` to generate a plan of the exact changes that will be performed (the plan name is arbitrary)
3. `terraform apply plan.out` to apply the plan
4. `terraform destroy` to tear down the infrastructure

## Design

This module deploys metapage workers as one or more [Managed Instance Groups](https://cloud.google.com/compute/docs/instance-groups) (MIGs) in GCP. The MIGs which should be created are defined via the `worker_groups` variable. Each MIG is assigned a job queue ID as part of its definition, and autoscales based on the `queue_length` Prometheus-style metric its own workers expose at the `/metrics` endpoint. This means as more jobs are added to the job queue, the MIG will automatically scale up to handle the increased load. As the number of unfinished jobs decreases, the MIG will conservatively scale in to save costs.

Since the metrics to determine scaling are served from the workers themselves, and we can't always be sure of any particular worker being online to request metrics from, we place an [Internal Load Balancer](https://cloud.google.com/load-balancing/docs/l7-internal) in front of the MIGs. We then use a separate instance for metric collection, which runs an [OpenTelemetry collector](https://opentelemetry.io/docs/collector/) to continually scrape metrics from the workers and export them to [Google Cloud Monitoring](https://cloud.google.com/monitoring/custom-metrics).

## Gotchas

There are currently a few quirks to be aware of when operating this infrastructure.

- Both the workers and the metrics collector run containers defined using [GCE instance metadata](https://cloud.google.com/compute/docs/containers/deploying-containers). Updating the container image/VM metadata will not automatically result in applied changes to the running VM, so you may need to have the MIG restart/recreate instances to fully apply changes right now.
- When the queue is getting a lot of jobs added & removed, different MIG members may report different metrics for `queue_length`, and can continue reporting that there are unfinished jobs in the queue even after the queue is empty for a little while -- however, this will gradually fall off and the MIG *will* eventually scale in, so don't be concerned if it looks "stuck" at a higher than necessary scale for a couple minutes. MIG autoscaling is by default rather conservative to prevent thrashing and yo-yoing of instances.
- There are a number of failure points in the process required to autoscale the MIGs for our case, and those failures can happen silently. Ideally we build a dashboard in Cloud Monitoring to get a view of our system at a glance, but this doesn't include one yet. Places to check for failures include: 1) the /metrics endpoints on the MIG instance containers, 2) connectivity to request metrics from MIG instances from the metrics collector (especially load balancer, DNS, etc configuration), and 3) the metrics collector itself which processes and exports to Cloud Monitoring.
- This module enables a number of Google APIs, and does *not* disable them or destroy the project when `terraform destroy` is run. If you want to be sure everything is torn down, you should delete your project manually in the GCP console.
