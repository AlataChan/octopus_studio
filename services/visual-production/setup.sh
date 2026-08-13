#!/bin/bash
# Visual production sidecar setup: create venv and install dependencies.
set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$SCRIPT_DIR"

if [ ! -d "venv" ]; then
  python3 -m venv venv
fi

source venv/bin/activate
python -m pip install --upgrade pip
python -m pip install -e .
echo "visual-production setup done. Run ./start.sh to launch."
