#!/bin/bash

set -eo pipefail

export API_SERVER_ADDRESS="https://container.mtfm.io"

if [ "$METAPAGE_IO_WORKER_RUN_STANDALONE" = "true" ]; then
    # Run docker daemon for environments that don't provide access to one
    dockerd -p /var/run/docker.pid &
fi

if [ -z "$METAPAGE_IO_WORKER_CPUS" ]; then
    # Default to 1 CPU
    METAPAGE_IO_WORKER_CPUS=1
fi

if [ -z "$METAPAGE_IO_WORKER_GPUS" ]; then
    # Default to 0 GPUs
    METAPAGE_IO_WORKER_GPUS=0
else
    # Running ldconfig here helps make nvidia libraries available to containers in
    # environments where they're mounted as part of initialization we don't control
    ldconfig
fi

if [ -n "$METAPAGE_IO_GENERATE_WORKER_ID" ]; then
    # Generate a random worker ID
    METAPAGE_IO_WORKER_ID_OPTION="--id $(uuidgen)"
fi

if [ -z "$@" ]; then
    # Run the metapage worker, with a queue ID provided by environment variable
    # Will supply the worker ID as well, if it was generated
    CMD="run --cpus $METAPAGE_IO_WORKER_CPUS --gpus $METAPAGE_IO_WORKER_GPUS $METAPAGE_IO_WORKER_ID_OPTION $METAPAGE_IO_QUEUE_ID"
else
    # Run the command provided by the user
    CMD="$@"
fi

# Use dockerd's dummy endpoint to check if it's running yet.
# It takes some seconds to start.
while (! curl -s --unix-socket /var/run/docker.sock http/_ping 2>&1 >/dev/null); do
    echo "Waiting for docker daemon to start..."
    sleep 1
done

deno run \
    --allow-sys \
    --allow-net \
    --allow-read \
    --allow-write \
    --allow-env \
    --allow-run \
    --unstable-cron \
    --unstable-kv \
    src/cli.ts \
    $CMD
