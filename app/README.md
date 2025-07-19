# Worker Deployments

The metapage worker can be deployed to any compute environment where it has access to a local docker daemon via
`docker.sock`. For any environment that doesn't have a daemon available, the worker can also run in a standalone mode
with `METAPAGE_WORKER_RUN_STANDALONE` set to `true` -- this causes the image to start and use its own docker daemon
instead.

## Fly.io

Fly is a developer-friendly platform for deploying applications near users. It accepts container definitions, but
doesn't actually run containers under the hood -- instead, the filesystem resulting from a container build is run
directly on a host Firecracker VM. Since there's no container runtime available by default in the VM, deployment to Fly
requires setting `METAPAGE_WORKER_RUN_STANDALONE` to leverage the included docker daemon.

There are a couple ways to perform autoscaling on Fly, but the way we're leveraging is by deploying a Fly Autoscaler
(`autoscaler.fly.toml`) as a separate Fly app. The autoscaler can watch and scale multiple worker apps based on
prometheus metrics scraped from an endpoint the app provides. We expose `queue_length` as a metric at
`localhost:8000/metrics`, served up from `run.ts`. We're scaling off of this simply, defining the right scale as 1 more
machine than the `queue_length`, up to the machine limit for the app. See https://github.com/superfly/fly-autoscaler for
more details about how the Autoscaler works.

To work on Fly deployments for the worker, you'll need to create the requisite Fly apps and set a couple of secrets.
Follow the [Fly documentation](https://fly.io/docs/launch/autoscale-by-metric/) for autoscaling by metric to get
started, using the local `autoscaler.fly.toml` as your configuration for the autoscaler app. It's already set up to
target the apps defined by `metapage-workers-a.fly.toml` and `metapage-workers-b.fly.toml`.
