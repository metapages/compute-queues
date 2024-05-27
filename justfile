set shell                          := ["bash", "-c"]
set dotenv-load                    := true

@_help:
  just --list --unsorted --list-heading $'Commands: (all services)\n'

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
