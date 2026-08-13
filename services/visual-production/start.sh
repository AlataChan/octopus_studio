#!/bin/bash
# Visual production sidecar startup. Usage: ./start.sh [--auto] [port]
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$SCRIPT_DIR"

PORT="${VISUAL_PRODUCTION_PORT:-8868}"
HOST="127.0.0.1"
AUTO_MODE=false

for arg in "$@"; do
  if [ "$arg" == "--auto" ]; then
    AUTO_MODE=true
  elif [[ "$arg" =~ ^[0-9]+$ ]]; then
    PORT=$arg
  fi
done

if [ ! -d "venv" ]; then
  echo "venv not found. Run ./setup.sh first."
  exit 1
fi

source venv/bin/activate

if lsof -Pi :$PORT -sTCP:LISTEN -t >/dev/null 2>&1; then
  if [ "$AUTO_MODE" = true ]; then
    lsof -ti:$PORT | xargs kill -9 2>/dev/null || true
    sleep 1
  else
    echo "Port $PORT in use."
    exit 1
  fi
fi

exec python -m octopus_visual_production serve --host "$HOST" --port "$PORT"
