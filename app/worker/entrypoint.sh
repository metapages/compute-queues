#!/bin/sh

# Run podman's API service in the background, making a docker-compatible socket available
podman system service --time=0 unix:///var/run/docker.sock &

# Run the metapage worker, with a queue ID provided by environment variable
deno run \
    --allow-sys \
    --allow-net \
    --allow-read \
    --allow-write \
    --allow-env \
    --allow-run \
    src/cli.ts \
    run \
    --cores=$METAPAGE_WORKER_CORES \
    $METAPAGE_QUEUE_ID
