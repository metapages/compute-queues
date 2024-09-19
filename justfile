set shell          := ["bash", "-c"]
set dotenv-load    := true
set export         := true

normal             := '\033[0m'
green              := "\\e[32m"
cyan               := "\\e[36m"

@_help:
  echo ""
  just --list --unsorted --list-heading $'Commands: (all services)\n'
  echo -e ""
  echo -e "    Sub-commands (e.g. just browser dev):"
  echo -e "       {{green}}app{{normal}}            -> just app"
  echo -e "       {{green}}browser{{normal}}        -> just app/browser"
  echo -e "       {{green}}worker{{normal}}         -> just app/worker"
  echo -e "       {{green}}api{{normal}}            -> just app/api"
  echo -e ""
  echo -e "    Current worker version: {{cyan}}$(cat app/worker/mod.json | jq -r '.version'){{normal}}"
  echo -e ""
  echo -e "    Quick links:"
  echo -e "       api local:             {{green}}https://worker-metaframe.localhost/{{normal}}"
  echo -e "       api production:        {{green}}https://container.mtfm.io{{normal}}"
  echo -e "       github repo:           {{green}}https://github.com/metapages/compute-queues{{normal}}"
  echo -e "       api deployment config: {{green}}https://dash.deno.com/projects/compute-queue-api{{normal}}"
  

# (_app "dev" args)
# Run the local development stack
@dev +args="": 
  just app/dev {{args}}

@down +args="": 
  just app/down {{args}}

# Publish e.g. docker images with whatever versioning scheme is appropriate
@publish-versioned-artifacts version="":
  just app/publish-versioned-artifacts {{version}}

# Local special development: remove local workers, rebuild, and run two workers
run-local-workers: publish-versioned-artifacts
  #!/usr/bin/env bash
  # Replace this with your image name (without tag)
  IMAGE_NAME="metapage/metaframe-docker-worker"

  # Get all container IDs for a given image name, ignoring the tag part
  CONTAINER_IDS=$(docker ps -a --format "{{{{.ID}}"  | xargs docker inspect --format '{{{{.Id}} {{{{.Config.Image}}' | grep $IMAGE_NAME | cut -d ' ' -f 1)

  if [ -z "$CONTAINER_IDS" ]; then
    echo "No containers found for image: $IMAGE_NAME"
  else
    echo "Found containers for image: $IMAGE_NAME"
    # Stop and remove the containers
    for CONTAINER_ID in $CONTAINER_IDS; do
      echo "Stopping container $CONTAINER_ID"
      docker stop $CONTAINER_ID
      echo "Removing container $CONTAINER_ID"
      docker rm $CONTAINER_ID
    done
    echo "All containers removed."
  fi

  VERSION=$(cat app/worker/mod.json | jq -r .version)
  docker run --restart unless-stopped -tid -v /var/run/docker.sock:/var/run/docker.sock -v /tmp:/tmp metapage/metaframe-docker-worker:$VERSION run --cpus=2 public1
  docker run --restart unless-stopped -tid -v /var/run/docker.sock:/var/run/docker.sock -v /tmp:/tmp metapage/metaframe-docker-worker:$VERSION run --cpus=2 ${DIONS_SECRET_QUEUE}

# Checks and tests
@test: check
  just app test

# Quick compilation checks
@check:
  just app check

# Remove all caches, generated files, etc.
@clean:
  just app/clean

# app subdirectory commands
alias app := _app
@_app +args="":
    just app/{{args}}

# app subdirectory commands
alias worker := _worker
@_worker +args="":
    just app/worker/{{args}}

# app subdirectory commands
alias browser := _browser
@_browser +args="":
    just app/browser/{{args}}

# app subdirectory commands
alias api := _api
@_api +args="":
    just app/api/{{args}}