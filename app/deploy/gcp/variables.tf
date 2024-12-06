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
    gpus = optional(object({
      count = number
      type  = string
    }))
    max_workers = optional(number, 10)
    min_workers = optional(number, 1)
  }))
  description = "Definitions of autoscaling worker groups to create. Map key will be used as the name of the worker group, so make sure it's DNS-friendly (no spaces, incompatible special characters, etc. The 'gpus' block is only appropriate for N1 series VMs with attached GPUs. If any other instance type is specified (like accelerator-optimized VMs), the 'gpus' block will be ignored.)"
}
