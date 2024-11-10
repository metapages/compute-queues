# Queue ID should be a secret later, but for development is fine supplied in var/objects
queue_id                      = "81e93644-4af2-11ef-a58f-676a7833797e"
region                        = "us-central1"
worker_image                  = "docker.io/michaelendsley/worker:latest"
opentelemetry_collector_image = "docker.io/otel/opentelemetry-collector:0.113.0"
