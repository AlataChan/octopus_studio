#!/usr/bin/env bash
set -euo pipefail

usage() {
  cat <<'EOF'
Configure Node registries for CN-friendly installs (npm + Yarn Berry).

This writes:
  - ~/.npmrc (registry + optional electron mirror)
  - .yarnrc.yml (npmRegistryServer) in current repo root (if present)

Usage:
  docker/scripts/configure-node-registries-cn.sh [--npm-registry URL] [--electron-mirror URL] [--scope SCOPE]

Defaults:
  npm-registry: https://registry.npmmirror.com
  electron-mirror: https://npmmirror.com/mirrors/electron/

Example:
  cd /opt/alata-studio
  ./docker/scripts/configure-node-registries-cn.sh
EOF
}

NPM_REGISTRY="https://registry.npmmirror.com"
ELECTRON_MIRROR="https://npmmirror.com/mirrors/electron/"
SCOPE=""

while [[ $# -gt 0 ]]; do
  case "$1" in
    -h|--help) usage; exit 0 ;;
    --npm-registry) NPM_REGISTRY="$2"; shift 2 ;;
    --electron-mirror) ELECTRON_MIRROR="$2"; shift 2 ;;
    --scope) SCOPE="$2"; shift 2 ;;
    *) echo "Unknown arg: $1" >&2; usage; exit 2 ;;
  esac
done

mkdir -p "$HOME"

{
  echo "registry=${NPM_REGISTRY}"
  echo "electron_mirror=${ELECTRON_MIRROR}"
} >"$HOME/.npmrc"

if [[ -n "$SCOPE" ]]; then
  echo "${SCOPE}:registry=${NPM_REGISTRY}" >>"$HOME/.npmrc"
fi

if [[ -f ".yarnrc.yml" ]]; then
  if command -v rg >/dev/null 2>&1; then
    if rg -q "^npmRegistryServer:" .yarnrc.yml; then
      # replace in-place
      perl -0777 -i -pe "s/^npmRegistryServer:.*$/npmRegistryServer: \\\"${NPM_REGISTRY//\//\\/}\\\"/m" .yarnrc.yml
    else
      echo "" >> .yarnrc.yml
      echo "npmRegistryServer: \"${NPM_REGISTRY}\"" >> .yarnrc.yml
    fi
  else
    echo "" >> .yarnrc.yml
    echo "npmRegistryServer: \"${NPM_REGISTRY}\"" >> .yarnrc.yml
  fi
fi

echo "Configured:"
echo "- ~/.npmrc (registry + electron_mirror)"
if [[ -f ".yarnrc.yml" ]]; then
  echo "- .yarnrc.yml (npmRegistryServer)"
fi

