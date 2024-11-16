# Queue ID should be a secret later, but for development is fine supplied in var/objects
queue_id                      = "81e93644-4af2-11ef-a58f-676a7833797e"
region                        = "us-central1"
worker_image                  = "docker.io/michaelendsley/worker:0.3.1"
opentelemetry_collector_image = "docker.io/otel/opentelemetry-collector-contrib:0.113.0"

worker_groups = {
  a = {
    queue_id      = "81e93644-4af2-11ef-a58f-676a7833797e"
    instance_type = "n4-standard-2"
    cpus          = 2
  }
  b = {
    queue_id      = "652ab68e-5f7b-11ef-b136-6f3c51289ae7"
    instance_type = "n4-standard-4"
    cpus          = 4
  }
}
