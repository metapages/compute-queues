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
