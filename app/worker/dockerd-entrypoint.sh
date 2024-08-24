#!/bin/sh

# Run docker daemon
dockerd -p /var/run/docker.pid &

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
