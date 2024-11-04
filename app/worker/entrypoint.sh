#!/bin/sh

if [ "$METAPAGE_WORKER_RUN_STANDALONE" = "true" ]; then
    # Run docker daemon for environments that don't provide access to one
    dockerd -p /var/run/docker.pid &
fi

if [ -z "$METAPAGE_WORKER_CPUS" ]; then
    # Default to 1 CPU
    METAPAGE_WORKER_CPUS=1
fi

# if [ -n "$METAPAGE_GENERATE_WORKER_ID" ]; then
#     # Generate a random worker ID
#     METAPAGE_WORKER_ID_OPTION="--id $(uuidgen)"
# fi

if [ -z "$@" ]; then
    # Run the metapage worker, with a queue ID provided by environment variable
    # Will supply the worker ID as well, if it was generated
    CMD="run --cpus $METAPAGE_WORKER_CPUS $METAPAGE_WORKER_ID_OPTION $METAPAGE_QUEUE_ID"
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
    src/cli.ts \
    $CMD
