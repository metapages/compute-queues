variable "queue_id" {
  type        = string
  description = "The queue id for the worker"
}

variable "region" {
  type        = string
  description = "The region in which we're rolling out IaC"
}

variable "opentelemetry_collector_image" {
  type        = string
  description = "Address of the container image to use for the OpenTelemetry Collector"
}

variable "worker_image" {
  type        = string
  description = "Address of the container image to use for the worker"
}

variable "worker_groups" {
  type = map(object({
    queue_id      = string
    instance_type = string
    cpus          = number
  }))
  description = "Definitions of autoscaling worker groups to create. Map key will be used as the name of the worker group, so make sure it's DNS-friendly (no spaces, incompatible special characters, etc.)"
}
