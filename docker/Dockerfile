# Setup base image
FROM ubuntu:jammy-20240627.1 AS base

# Build arguments
ARG ARG_UID=1000
ARG ARG_GID=1000

FROM base AS build-arm64
RUN echo "Preparing build of AnythingLLM image for arm64 architecture"

SHELL ["/bin/bash", "-o", "pipefail", "-c"]

# Build arguments for toolchain versions
ARG NODE_MAJOR=20
ARG YARN_VERSION=4.5.0
ARG UV_VERSION=0.6.10
ARG INSTALL_UVX=0

# Install system dependencies
# hadolint ignore=DL3008,DL3013
RUN DEBIAN_FRONTEND=noninteractive apt-get update && \
    DEBIAN_FRONTEND=noninteractive apt-get install -yq --no-install-recommends \
        unzip curl gnupg libgfortran5 libgbm1 tzdata netcat \
        libasound2 libatk1.0-0 libc6 libcairo2 libcups2 libdbus-1-3 libexpat1 libfontconfig1 \
        libgcc1 libglib2.0-0 libgtk-3-0 libnspr4 libpango-1.0-0 libx11-6 libx11-xcb1 libxcb1 \
        libxcomposite1 libxcursor1 libxdamage1 libxext6 libxfixes3 libxi6 libxrandr2 libxrender1 \
        libxss1 libxtst6 ca-certificates fonts-liberation libappindicator1 libnss3 lsb-release \
        xdg-utils git build-essential ffmpeg && \
    mkdir -p /etc/apt/keyrings && \
    curl -fsSL https://deb.nodesource.com/gpgkey/nodesource-repo.gpg.key | gpg --dearmor -o /etc/apt/keyrings/nodesource.gpg && \
    echo "deb [signed-by=/etc/apt/keyrings/nodesource.gpg] https://deb.nodesource.com/node_${NODE_MAJOR}.x nodistro main" | tee /etc/apt/sources.list.d/nodesource.list && \
    apt-get update && \
    # Install node
    apt-get install -yq --no-install-recommends nodejs && \
    # Install Yarn via Corepack (repo uses Yarn Berry)
    corepack enable && \
    corepack prepare "yarn@${YARN_VERSION}" --activate && \
    # Install uvx (optional) for MCP support
    if [ "${INSTALL_UVX}" = "1" ]; then \
      echo "Installing uvx (uv ${UV_VERSION})..."; \
      (curl -LsSf --retry 5 --retry-delay 2 --retry-all-errors "https://astral.sh/uv/${UV_VERSION}/install.sh" | sh && \
        mv /root/.local/bin/uv /usr/local/bin/uv && \
        mv /root/.local/bin/uvx /usr/local/bin/uvx && \
        echo "Installed uvx! $(uv --version)") || echo "uvx install failed; continuing without uvx"; \
    else \
      echo "Skipping uvx install (INSTALL_UVX=${INSTALL_UVX})"; \
    fi && \
    apt-get clean && \
    rm -rf /var/lib/apt/lists/*

# Create a user/group pair, but tolerate host GIDs that already exist in the base image
RUN if getent group "$ARG_GID" >/dev/null; then \
      PRIMARY_GROUP="$(getent group "$ARG_GID" | cut -d: -f1)"; \
      groupadd anythingllm; \
      useradd -l -u "$ARG_UID" -m -d /app -s /bin/bash -g "$PRIMARY_GROUP" -G anythingllm anythingllm; \
    else \
      groupadd -g "$ARG_GID" anythingllm; \
      useradd -l -u "$ARG_UID" -m -d /app -s /bin/bash -g anythingllm anythingllm; \
    fi && \
    mkdir -p /app/frontend/ /app/server/ /app/collector/ && chown -R anythingllm:anythingllm /app

# Copy docker helper scripts
COPY ./docker/docker-entrypoint.sh /usr/local/bin/
COPY ./docker/docker-healthcheck.sh /usr/local/bin/
COPY --chown=anythingllm:anythingllm ./docker/.env.example /app/server/.env

# Ensure the scripts are executable
RUN chmod +x /usr/local/bin/docker-entrypoint.sh && \
    chmod +x /usr/local/bin/docker-healthcheck.sh

USER anythingllm
WORKDIR /app

# Puppeteer does not ship with an ARM86 compatible build for Chromium
# so web-scraping would be broken in arm docker containers unless we patch it
# by manually installing a compatible chromedriver.
RUN echo "Need to patch Puppeteer x Chromium support for ARM86 - installing dep!" && \
    curl https://playwright.azureedge.net/builds/chromium/1088/chromium-linux-arm64.zip -o chrome-linux.zip && \
    unzip chrome-linux.zip && \
    rm -rf chrome-linux.zip

ENV PUPPETEER_SKIP_CHROMIUM_DOWNLOAD=true
ENV CHROME_PATH=/app/chrome-linux/chrome
ENV PUPPETEER_EXECUTABLE_PATH=/app/chrome-linux/chrome

RUN echo "Done running arm64 specific installation steps"

#############################################

# amd64-specific stage
FROM base AS build-amd64
RUN echo "Preparing build of AnythingLLM image for non-ARM architecture"

SHELL ["/bin/bash", "-o", "pipefail", "-c"]

# Build arguments for toolchain versions
ARG NODE_MAJOR=20
ARG YARN_VERSION=4.5.0
ARG UV_VERSION=0.6.10
ARG INSTALL_UVX=0

# Install system dependencies
# hadolint ignore=DL3008,DL3013
RUN DEBIAN_FRONTEND=noninteractive apt-get update && \
    DEBIAN_FRONTEND=noninteractive apt-get install -yq --no-install-recommends \
        curl gnupg libgfortran5 libgbm1 tzdata netcat \
        libasound2 libatk1.0-0 libc6 libcairo2 libcups2 libdbus-1-3 libexpat1 libfontconfig1 \
        libgcc1 libglib2.0-0 libgtk-3-0 libnspr4 libpango-1.0-0 libx11-6 libx11-xcb1 libxcb1 \
        libxcomposite1 libxcursor1 libxdamage1 libxext6 libxfixes3 libxi6 libxrandr2 libxrender1 \
        libxss1 libxtst6 ca-certificates fonts-liberation libappindicator1 libnss3 lsb-release \
        xdg-utils git build-essential ffmpeg && \
    mkdir -p /etc/apt/keyrings && \
    curl -fsSL https://deb.nodesource.com/gpgkey/nodesource-repo.gpg.key | gpg --dearmor -o /etc/apt/keyrings/nodesource.gpg && \
    echo "deb [signed-by=/etc/apt/keyrings/nodesource.gpg] https://deb.nodesource.com/node_${NODE_MAJOR}.x nodistro main" | tee /etc/apt/sources.list.d/nodesource.list && \
    apt-get update && \
    # Install node
    apt-get install -yq --no-install-recommends nodejs && \
    # Install Yarn via Corepack (repo uses Yarn Berry)
    corepack enable && \
    corepack prepare "yarn@${YARN_VERSION}" --activate && \
    # Install uvx (optional) for MCP support
    if [ "${INSTALL_UVX}" = "1" ]; then \
      echo "Installing uvx (uv ${UV_VERSION})..."; \
      (curl -LsSf --retry 5 --retry-delay 2 --retry-all-errors "https://astral.sh/uv/${UV_VERSION}/install.sh" | sh && \
        mv /root/.local/bin/uv /usr/local/bin/uv && \
        mv /root/.local/bin/uvx /usr/local/bin/uvx && \
        echo "Installed uvx! $(uv --version)") || echo "uvx install failed; continuing without uvx"; \
    else \
      echo "Skipping uvx install (INSTALL_UVX=${INSTALL_UVX})"; \
    fi && \
    apt-get clean && \
    rm -rf /var/lib/apt/lists/*

# Create a user/group pair, but tolerate host GIDs that already exist in the base image
RUN if getent group "$ARG_GID" >/dev/null; then \
      PRIMARY_GROUP="$(getent group "$ARG_GID" | cut -d: -f1)"; \
      groupadd anythingllm; \
      useradd -l -u "$ARG_UID" -m -d /app -s /bin/bash -g "$PRIMARY_GROUP" -G anythingllm anythingllm; \
    else \
      groupadd -g "$ARG_GID" anythingllm; \
      useradd -l -u "$ARG_UID" -m -d /app -s /bin/bash -g anythingllm anythingllm; \
    fi && \
    mkdir -p /app/frontend/ /app/server/ /app/collector/ && chown -R anythingllm:anythingllm /app

# Copy docker helper scripts
COPY ./docker/docker-entrypoint.sh /usr/local/bin/
COPY ./docker/docker-healthcheck.sh /usr/local/bin/
COPY --chown=anythingllm:anythingllm ./docker/.env.example /app/server/.env

# Ensure the scripts are executable
RUN chmod +x /usr/local/bin/docker-entrypoint.sh && \
    chmod +x /usr/local/bin/docker-healthcheck.sh

#############################################
# COMMON BUILD FLOW FOR ALL ARCHS
#############################################

# hadolint ignore=DL3006
FROM build-${TARGETARCH} AS build
RUN echo "Running common build flow of AnythingLLM image for all architectures"

USER anythingllm
WORKDIR /app

# Install & Build frontend layer
FROM build AS frontend-build
WORKDIR /app
COPY --chown=anythingllm:anythingllm package.json /app/package.json
COPY --chown=anythingllm:anythingllm frontend/package.json /app/frontend/package.json
COPY --chown=anythingllm:anythingllm server/package.json /app/server/package.json
COPY --chown=anythingllm:anythingllm collector/package.json /app/collector/package.json
RUN printf '%s\n' \
      'nodeLinker: node-modules' \
      'httpTimeout: 600000' \
      'httpRetry: 5' \
      'networkConcurrency: 8' \
      'npmRegistryServer: "https://registry.npmjs.org"' \
      > /app/.yarnrc.yml
RUN corepack yarn --version && \
    NODE_OPTIONS="--max-old-space-size=2048" corepack yarn workspaces focus anything-llm-frontend && \
    corepack yarn cache clean
COPY --chown=anythingllm:anythingllm ./frontend /app/frontend/
RUN corepack yarn workspace anything-llm-frontend build && \
    cp -r /app/frontend/dist /tmp/frontend-build && \
    rm -rf /app/frontend/* && \
    cp -r /tmp/frontend-build /app/frontend/dist && \
    rm -rf /tmp/frontend-build
WORKDIR /app

# Install server layer
# Also pull and build collector deps (chromium issues prevent bad bindings)
FROM build AS backend-build
WORKDIR /app
ENV PUPPETEER_DOWNLOAD_BASE_URL=https://storage.googleapis.com/chrome-for-testing-public
COPY --chown=anythingllm:anythingllm package.json /app/package.json
COPY --chown=anythingllm:anythingllm server/package.json /app/server/package.json
COPY --chown=anythingllm:anythingllm collector/package.json /app/collector/package.json
COPY --chown=anythingllm:anythingllm frontend/package.json /app/frontend/package.json
RUN printf '%s\n' \
      'nodeLinker: node-modules' \
      'httpTimeout: 600000' \
      'httpRetry: 5' \
      'networkConcurrency: 8' \
      'npmRegistryServer: "https://registry.npmjs.org"' \
      > /app/.yarnrc.yml
RUN corepack yarn --version && \
    NODE_OPTIONS="--max-old-space-size=2048" corepack yarn workspaces focus --production \
      anything-llm-server \
      anything-llm-document-collector && \
    corepack yarn cache clean
COPY --chown=anythingllm:anythingllm ./server /app/server/
COPY --chown=anythingllm:anythingllm ./collector /app/collector/
COPY --chown=anythingllm:anythingllm ./scripts/import-agency-agents /app/scripts/import-agency-agents/
COPY --chown=anythingllm:anythingllm ./docker/scripts /app/docker/scripts/

WORKDIR /app
USER anythingllm

# Since we are building from backend-build we just need to move built frontend into server/public
FROM backend-build AS production-build
WORKDIR /app
COPY --chown=anythingllm:anythingllm --from=frontend-build /app/frontend/dist /app/server/public
USER root
RUN chown -R anythingllm:anythingllm /app/server && \
    chown -R anythingllm:anythingllm /app/collector
USER anythingllm

# Setup the environment
ENV NODE_ENV=production
ENV ANYTHING_LLM_RUNTIME=docker
ENV DEPLOYMENT_VERSION=1.9.0

# Setup the healthcheck
HEALTHCHECK --interval=1m --timeout=10s --start-period=1m \
  CMD /bin/bash /usr/local/bin/docker-healthcheck.sh || exit 1

# Run the server
# CMD ["sh", "-c", "tail -f /dev/null"] # For development: keep container open
ENTRYPOINT ["/bin/bash", "/usr/local/bin/docker-entrypoint.sh"]
