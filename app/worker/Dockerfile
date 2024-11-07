#################################################################
# Base image
#################################################################
FROM denoland/deno:2.0.3 AS worker

# # https://gist.github.com/squarebracket/e719069522436873bc6f13efb359cac9
# RUN cp /etc/ssl/certs/ca-certificates.crt /etc/ssl/cert.pem

RUN apt-get update && apt-get -y install \
	ca-certificates \
	fuse-overlayfs && \
	rm -rf /var/lib/apt/lists/*

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

COPY ./worker/entrypoint.sh /entrypoint.sh

LABEL container.mtfm.io=worker

ENTRYPOINT ["/entrypoint.sh"]

# The standalone worker contains its own copy of dockerd, so it doesn't need to rely
# on access to the host, and can run in environments where a docker socket isn't provided.
FROM worker AS worker-standalone

ENV DOCKER_VERSION=5:27.1.1-1~debian.12~bookworm

RUN apt-get update && \
	apt-get --yes install ca-certificates curl && \
	install -m 0755 -d /etc/apt/keyrings && \
	curl -fsSL https://download.docker.com/linux/debian/gpg -o /etc/apt/keyrings/docker.asc && \
	chmod a+r /etc/apt/keyrings/docker.asc && \
	echo \
	"deb [arch=$(dpkg --print-architecture) signed-by=/etc/apt/keyrings/docker.asc] https://download.docker.com/linux/debian \
	$(. /etc/os-release && echo "$VERSION_CODENAME") stable" | \
	tee /etc/apt/sources.list.d/docker.list > /dev/null && \
	apt-get update && \
	apt-get --yes install \
	docker-ce=$DOCKER_VERSION \
	docker-ce-cli=$DOCKER_VERSION \
	containerd.io \
	docker-buildx-plugin && \
	rm -rf /var/lib/apt/lists/*

COPY ./worker/daemon.json /etc/docker/daemon.json

ENTRYPOINT ["/entrypoint.sh"]