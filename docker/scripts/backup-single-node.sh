#!/usr/bin/env bash
set -euo pipefail

usage() {
  cat <<'EOF'
Backup Alata/AnythingLLM single-node (SQLite + local storage).

Default layout (recommended on Tencent Cloud Ubuntu):
  /data/alata/server/storage
  /data/alata/collector/hotdir
  /data/alata/collector/outputs
  /data/alata/env/.env

Usage:
  docker/scripts/backup-single-node.sh [--data-root DIR] [--backup-dir DIR] [--compose-file FILE] [--env-file FILE] [--keep N] [--no-stop]

Examples:
  docker/scripts/backup-single-node.sh
  docker/scripts/backup-single-node.sh --keep 14
  docker/scripts/backup-single-node.sh --data-root /data/alata --backup-dir /data/alata-backups
EOF
}

DATA_ROOT="/data/alata"
BACKUP_DIR="/data/alata-backups"
COMPOSE_FILE="docker/docker-compose.cloud.single-node.yml"
ENV_FILE="/data/alata/env/.env"
KEEP=""
NO_STOP="0"

while [[ $# -gt 0 ]]; do
  case "$1" in
    -h|--help) usage; exit 0 ;;
    --data-root) DATA_ROOT="$2"; shift 2 ;;
    --backup-dir) BACKUP_DIR="$2"; shift 2 ;;
    --compose-file) COMPOSE_FILE="$2"; shift 2 ;;
    --env-file) ENV_FILE="$2"; shift 2 ;;
    --keep) KEEP="$2"; shift 2 ;;
    --no-stop) NO_STOP="1"; shift 1 ;;
    *) echo "Unknown arg: $1" >&2; usage; exit 2 ;;
  esac
done

timestamp="$(date +%F_%H%M%S)"
archive="${BACKUP_DIR}/alata-${timestamp}.tar.gz"

mkdir -p "$BACKUP_DIR"

if [[ "$NO_STOP" != "1" ]]; then
  docker compose -f "$COMPOSE_FILE" --env-file "$ENV_FILE" stop
fi

tar -czf "$archive" \
  -C "$(dirname "$DATA_ROOT")" "$(basename "$DATA_ROOT")"

if [[ "$NO_STOP" != "1" ]]; then
  docker compose -f "$COMPOSE_FILE" --env-file "$ENV_FILE" start
fi

echo "Backup written: $archive"

if [[ -n "$KEEP" ]]; then
  ls -1t "${BACKUP_DIR}/alata-"*.tar.gz 2>/dev/null | tail -n +"$((KEEP + 1))" | xargs -r rm -f
  echo "Retention applied: keep last $KEEP backups in $BACKUP_DIR"
fi

