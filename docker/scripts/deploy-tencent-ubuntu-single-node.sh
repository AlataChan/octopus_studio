#!/usr/bin/env bash
set -euo pipefail

usage() {
  cat <<'EOF'
Tencent Cloud Ubuntu single-node deploy (build from source).

Defaults:
  Repo:      https://github.com/AlataChan/alata-studio.git
  Branch:    main
  App dir:   /opt/alata-studio
  Data dir:  /data/alata
  Env file:  /data/alata/env/.env
  Compose:   docker/docker-compose.cloud.single-node.yml

Usage:
  sudo -E docker/scripts/deploy-tencent-ubuntu-single-node.sh [--repo URL] [--branch NAME] [--app-dir DIR] [--data-dir DIR] [--skip-mirrors] [--no-cache] [--retries N]

Notes:
  - This script assumes Docker + docker compose plugin already installed.
  - It will configure Docker mirrors and Ubuntu APT mirrors unless --skip-mirrors is set.
  - It retries docker builds to handle transient network timeouts (e.g. ffmpeg-static downloads).
EOF
}

REPO="https://github.com/AlataChan/alata-studio.git"
BRANCH="main"
APP_DIR="/opt/alata-studio"
DATA_DIR="/data/alata"
SKIP_MIRRORS="0"
NO_CACHE="0"
RETRIES="3"

while [[ $# -gt 0 ]]; do
  case "$1" in
    -h|--help) usage; exit 0 ;;
    --repo) REPO="$2"; shift 2 ;;
    --branch) BRANCH="$2"; shift 2 ;;
    --app-dir) APP_DIR="$2"; shift 2 ;;
    --data-dir) DATA_DIR="$2"; shift 2 ;;
    --skip-mirrors) SKIP_MIRRORS="1"; shift 1 ;;
    --no-cache) NO_CACHE="1"; shift 1 ;;
    --retries) RETRIES="$2"; shift 2 ;;
    *) echo "Unknown arg: $1" >&2; usage; exit 2 ;;
  esac
done

if [[ "${EUID:-$(id -u)}" -ne 0 ]]; then
  echo "Please run as root (use sudo)." >&2
  exit 1
fi

if ! command -v docker >/dev/null 2>&1; then
  echo "Docker is not installed. Please install Docker first (https://get.docker.com) and re-run." >&2
  exit 1
fi

if ! docker compose version >/dev/null 2>&1; then
  echo "docker compose plugin is missing. Please install docker-compose-plugin and re-run." >&2
  exit 1
fi

ENV_FILE="${DATA_DIR}/env/.env"
COMPOSE_FILE="docker/docker-compose.cloud.single-node.yml"

mkdir -p "$APP_DIR"
mkdir -p "${DATA_DIR}/server/storage" "${DATA_DIR}/collector/hotdir" "${DATA_DIR}/collector/outputs" "${DATA_DIR}/env"

if [[ ! -d "${APP_DIR}/.git" ]]; then
  rm -rf "$APP_DIR"
  git clone -b "$BRANCH" "$REPO" "$APP_DIR"
else
  git -C "$APP_DIR" fetch --all --prune
  git -C "$APP_DIR" checkout "$BRANCH"
  git -C "$APP_DIR" pull --ff-only origin "$BRANCH"
fi

if [[ "$SKIP_MIRRORS" != "1" ]]; then
  if [[ -x "${APP_DIR}/docker/scripts/configure-docker-mirrors-cn.sh" ]]; then
    "${APP_DIR}/docker/scripts/configure-docker-mirrors-cn.sh" --preset tencent || true
  fi
  if [[ -x "${APP_DIR}/docker/scripts/configure-ubuntu-apt-mirrors-cn.sh" ]]; then
    "${APP_DIR}/docker/scripts/configure-ubuntu-apt-mirrors-cn.sh" --preset tencent || true
  fi
  if [[ -x "${APP_DIR}/docker/scripts/configure-node-registries-cn.sh" ]]; then
    (cd "$APP_DIR" && "${APP_DIR}/docker/scripts/configure-node-registries-cn.sh") || true
  fi
fi

if [[ ! -f "$ENV_FILE" ]]; then
  cp "${APP_DIR}/docker/.env.cloud.example" "$ENV_FILE"
  echo "Created env file: $ENV_FILE"
  echo "Please edit it (set JWT_SECRET/AUTH_TOKEN/SIG_KEY/SIG_SALT and your API keys) then re-run this script." >&2
  exit 2
fi

cd "$APP_DIR"

build_flags=()
if [[ "$NO_CACHE" == "1" ]]; then
  build_flags+=(--no-cache)
fi

export DOCKER_BUILDKIT=1
export COMPOSE_DOCKER_CLI_BUILD=1

attempt=1
while true; do
  echo "Build attempt ${attempt}/${RETRIES}..."
  if docker compose -f "$COMPOSE_FILE" --env-file "$ENV_FILE" build --progress=plain "${build_flags[@]}"; then
    break
  fi

  if [[ "$attempt" -ge "$RETRIES" ]]; then
    echo "Build failed after ${RETRIES} attempts." >&2
    exit 1
  fi
  attempt=$((attempt + 1))
  echo "Build failed (transient?). Retrying in 10s..." >&2
  sleep 10
done

docker compose -f "$COMPOSE_FILE" --env-file "$ENV_FILE" up -d
docker compose -f "$COMPOSE_FILE" --env-file "$ENV_FILE" ps
