# Compute queues and the worker to run them all


## Short description

Run scientific workflow anywhere, reliably, via the browser. For compute heavy jobs, use your own computer, or run on a cluster. Share compute. Run scientific workflows no matter how old.

## Longer description

Metapages require running docker containers, as a service. 

This service provides an iframe, that allows users to configure running a specific docker container (a **job**) on a specific **queue**. The iframed browser window sends that job configuration to the server, the job is added to the queue, then workers pick up the job, run it, and send the results back.

To run those docker containers, users can either rent compute from the metapage platform, or run worker(s) themselves, either on their own personal laptops/desktops, or on their own cluster infrastructure. Docker images can be used directly, or a git repo can be given, and the docker image built directly.

This repo contains all the infrastructure for the queues, workers, and examples of cloud providers managing the horizintal scaling worker fleets.


## How does this compare to dask, kubernetes, etc

TODO:, this needs to be in notion, so use a docs exporter.