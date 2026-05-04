# ──────────────────────────────────────────────
# Runtime
# Image: ghcr.io/gsd-build/gsd-pi
# Used by: end users via docker run
# ──────────────────────────────────────────────
FROM node:24-slim AS runtime

# Git is required for GSD's git operations
RUN apt-get update && apt-get install -y --no-install-recommends \
    git \
    && rm -rf /var/lib/apt/lists/*

# Install GSD globally — version is controlled by the build arg
ARG GSD_VERSION=latest
RUN npm install -g gsd-pi@${GSD_VERSION}

# Default working directory for user projects
WORKDIR /workspace

ENTRYPOINT ["gsd"]
CMD ["--help"]

# ──────────────────────────────────────────────
# Runtime (local build)
# Image: ghcr.io/gsd-build/gsd-pi:local
# Used by: PR-time e2e smoke, builds the *current source* into an image
# instead of pulling from npm. Lets `tests/e2e/docker/` exercise the actual
# runtime container produced by this branch's code.
# Build with:  docker build --target runtime-local \
#                --build-arg TARBALL=gsd-pi-<version>.tgz -t gsd-pi:local .
# The tarball must be in the build context (created by `npm pack`).
# ──────────────────────────────────────────────
FROM node:24-slim AS runtime-local

RUN apt-get update && apt-get install -y --no-install-recommends \
    git \
    && rm -rf /var/lib/apt/lists/*

ARG TARBALL
COPY ${TARBALL} /tmp/gsd-pi.tgz
# `npm install -g` of a local tarball is more brittle than installing
# from the registry: postinstall hooks may exit non-zero when network
# resources aren't reachable, and the bin shim can end up off PATH
# depending on the npm prefix. Run with --ignore-scripts to skip
# postinstall (we don't need any of its work for `--version`/`--help`
# smoke), and verify the bin shim is present + exportable on PATH so
# this fails loudly at build time rather than silently at run time.
RUN npm install -g --ignore-scripts /tmp/gsd-pi.tgz \
    && rm /tmp/gsd-pi.tgz \
    && which gsd \
    && gsd --version

WORKDIR /workspace

ENTRYPOINT ["gsd"]
CMD ["--help"]
