#!/bin/bash

set -eo pipefail

if [ "$METAPAGE_IO_WORKER_RUN_STANDALONE" = "true" ]; then
    # In standalone environments, the ID generation seems to produce the same ID for all workers,
    # so pass in our own here instead. Save to a file for persistence across restarts.
    id_file="/metapage_io_worker_id"
    if [ ! -f "${id_file}" ]; then
        echo "No worker ID file found at /metapage_io_worker_id, generating one..."
        uuidgen > $id_file
    fi
    METAPAGE_IO_CUSTOM_WORKER_ID=$(cat $id_file)

    # Run docker daemon for environments that don't provide access to one
    dockerd -p /var/run/docker.pid &

    # Running ldconfig here helps make nvidia libraries available to containers in
    # environments where they're mounted as part of initialization we don't control
    ldconfig
fi

# Use dockerd's dummy endpoint to check if it's running.
# It takes some seconds to start.
while (! curl -s --unix-socket /var/run/docker.sock http/_ping 2>&1 >/dev/null); do
    echo "Pinged docker daemon, but got no response. Waiting for docker daemon to start..."
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
    $@
