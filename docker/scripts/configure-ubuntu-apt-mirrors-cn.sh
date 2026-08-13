#!/usr/bin/env bash
set -euo pipefail

usage() {
  cat <<'EOF'
Configure Ubuntu APT mirrors (CN friendly).

This rewrites /etc/apt/sources.list (Ubuntu 22.04+/uses deb822 in some images are not assumed).

Usage:
  sudo docker/scripts/configure-ubuntu-apt-mirrors-cn.sh --preset PRESET

Presets:
  tencent -> https://mirrors.tencent.com/ubuntu/
  aliyun  -> https://mirrors.aliyun.com/ubuntu/
  tuna    -> https://mirrors.tuna.tsinghua.edu.cn/ubuntu/

Example:
  sudo docker/scripts/configure-ubuntu-apt-mirrors-cn.sh --preset tencent
EOF
}

PRESET="tencent"

while [[ $# -gt 0 ]]; do
  case "$1" in
    -h|--help) usage; exit 0 ;;
    --preset) PRESET="$2"; shift 2 ;;
    *) echo "Unknown arg: $1" >&2; usage; exit 2 ;;
  esac
done

if [[ "${EUID:-$(id -u)}" -ne 0 ]]; then
  echo "Please run as root (use sudo)." >&2
  exit 1
fi

if [[ ! -f /etc/os-release ]]; then
  echo "Cannot detect OS release." >&2
  exit 1
fi

source /etc/os-release
if [[ "${ID:-}" != "ubuntu" ]]; then
  echo "This script is intended for Ubuntu. Detected: ${ID:-unknown}" >&2
  exit 2
fi

mirror=""
case "$PRESET" in
  tencent) mirror="https://mirrors.tencent.com/ubuntu/" ;;
  aliyun) mirror="https://mirrors.aliyun.com/ubuntu/" ;;
  tuna) mirror="https://mirrors.tuna.tsinghua.edu.cn/ubuntu/" ;;
  *) echo "Invalid preset: $PRESET" >&2; usage; exit 2 ;;
esac

codename="${VERSION_CODENAME:-}"
if [[ -z "$codename" ]]; then
  codename="$(lsb_release -sc 2>/dev/null || true)"
fi
if [[ -z "$codename" ]]; then
  echo "Cannot determine Ubuntu codename." >&2
  exit 1
fi

backup="/etc/apt/sources.list.bak.$(date +%s)"
if [[ -f /etc/apt/sources.list ]]; then
  cp /etc/apt/sources.list "$backup"
  echo "Backed up /etc/apt/sources.list -> $backup"
fi

cat >/etc/apt/sources.list <<EOF
deb ${mirror} ${codename} main restricted universe multiverse
deb ${mirror} ${codename}-updates main restricted universe multiverse
deb ${mirror} ${codename}-backports main restricted universe multiverse
deb http://security.ubuntu.com/ubuntu ${codename}-security main restricted universe multiverse
EOF

apt-get update
echo "APT mirror configured: $mirror (codename: $codename)"

