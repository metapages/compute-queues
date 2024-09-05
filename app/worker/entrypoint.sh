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
    --cpus=$METAPAGE_WORKER_CPUS \
    $METAPAGE_QUEUE_ID
