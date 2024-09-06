#!/bin/sh

if [ "$METAPAGE_WORKER_RUN_STANDALONE" = "true" ]; then
    # Run podman's API service in the background, making a docker-compatible socket available
    podman system service --time=0 unix:///var/run/docker.sock &
fi

if [ -z "$METAPAGE_WORKER_CPUS" ]; then
    # Default to 1 CPU
    METAPAGE_WORKER_CPUS=1
fi

if [ -z "$@" ]; then
    # Run the metapage worker, with a queue ID provided by environment variable
    CMD="run --cpus $METAPAGE_WORKER_CPUS $METAPAGE_QUEUE_ID"
else
    # Run the command provided by the user
    CMD="$@"
fi

deno run \
    --allow-sys \
    --allow-net \
    --allow-read \
    --allow-write \
    --allow-env \
    --allow-run \
    src/cli.ts \
    $CMD
