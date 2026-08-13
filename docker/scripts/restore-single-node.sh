#!/usr/bin/env bash
set -euo pipefail

usage() {
  cat <<'EOF'
Restore Alata/AnythingLLM single-node backup created by backup-single-node.sh

Usage:
  docker/scripts/restore-single-node.sh --archive FILE [--data-root DIR] [--compose-file FILE] [--env-file FILE]

Example:
  docker/scripts/restore-single-node.sh --archive /data/alata-backups/alata-2026-01-25_120000.tar.gz
EOF
}

ARCHIVE=""
DATA_ROOT="/data/alata"
COMPOSE_FILE="docker/docker-compose.cloud.single-node.yml"
ENV_FILE="/data/alata/env/.env"

while [[ $# -gt 0 ]]; do
  case "$1" in
    -h|--help) usage; exit 0 ;;
    --archive) ARCHIVE="$2"; shift 2 ;;
    --data-root) DATA_ROOT="$2"; shift 2 ;;
    --compose-file) COMPOSE_FILE="$2"; shift 2 ;;
    --env-file) ENV_FILE="$2"; shift 2 ;;
    *) echo "Unknown arg: $1" >&2; usage; exit 2 ;;
  esac
done

if [[ -z "$ARCHIVE" ]]; then
  echo "--archive is required" >&2
  usage
  exit 2
fi

if [[ ! -f "$ARCHIVE" ]]; then
  echo "Archive not found: $ARCHIVE" >&2
  exit 2
fi

docker compose -f "$COMPOSE_FILE" --env-file "$ENV_FILE" down

rm -rf "$DATA_ROOT"
mkdir -p "$(dirname "$DATA_ROOT")"
tar -xzf "$ARCHIVE" -C "$(dirname "$DATA_ROOT")"

docker compose -f "$COMPOSE_FILE" --env-file "$ENV_FILE" up -d

echo "Restore complete from: $ARCHIVE"

