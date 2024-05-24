#################################################################
# Base image
#################################################################
FROM denoland/deno:alpine-1.43.6 as worker


RUN apk --no-cache add \
    openssh \
    socat

# https://gist.github.com/squarebracket/e719069522436873bc6f13efb359cac9
RUN cp /etc/ssl/certs/ca-certificates.crt /etc/ssl/cert.pem

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

ENTRYPOINT ["deno", "run", "--allow-net", "--allow-read", "--allow-env", "--allow-run", "src/cli.ts"]
