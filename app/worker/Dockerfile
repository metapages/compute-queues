#################################################################
# Base image
#################################################################
FROM denoland/deno:1.45.5 as worker

# # https://gist.github.com/squarebracket/e719069522436873bc6f13efb359cac9
# RUN cp /etc/ssl/certs/ca-certificates.crt /etc/ssl/cert.pem

RUN apt-get update && apt-get -y install podman ca-certificates fuse-overlayfs slirp4netns
# Alias docker to podman
RUN ln -s $(which podman) /usr/bin/docker

COPY ./worker/entrypoint.sh /entrypoint.sh
VOLUME /var/lib/containers

WORKDIR /app
COPY ./worker/src ./worker/src
COPY ./worker/deno.json ./worker/deno.json
COPY ./worker/deno.lock ./worker/deno.lock
COPY ./worker/mod.json ./worker/mod.json
COPY ./shared ./shared

WORKDIR /app/worker

ARG VERSION=cache
ENV VERSION=$VERSION

RUN deno cache --unstable src/cli.ts

ENTRYPOINT ["/entrypoint.sh"]
