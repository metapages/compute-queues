set shell        := ["bash", "-c"]
set dotenv-load  := true
normal           := '\033[0m'
green            := "\\e[32m"

@_help:
  echo ""
  just --list --unsorted --list-heading $'Commands: (all services)\n'
  echo -e ""
  echo -e "    Quick links:"
  echo -e "       api production:        {{green}}https://container.mtfm.io{{normal}}"
  echo -e "       github repo:           {{green}}https://github.com/metapages/compute-queues{{normal}}"
  echo -e "       api deployment config: {{green}}https://dash.deno.com/projects/compute-queue-api{{normal}}"
  


# Run the local development stack
@dev +args="": (_app "dev" args)
  just app/dev

# Publish e.g. docker images with whatever versioning scheme is appropriate
@publish-versioned-artifacts version="":
  just app/publish-versioned-artifacts {{version}}

# Checks and tests
@test: check
  deno test --allow-net --allow-read --allow-env --allow-write --allow-run .
  echo "✅ worker unit tests"

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
