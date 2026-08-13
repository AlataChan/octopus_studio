#!/usr/bin/env bash
set -euo pipefail

usage() {
  cat <<'EOF'
Configure Docker Hub registry mirrors (China mainland friendly).

This modifies /etc/docker/daemon.json and restarts Docker.

Usage:
  sudo docker/scripts/configure-docker-mirrors-cn.sh [--preset PRESET] [--aliyun-mirror URL]

Presets:
  tencent   -> https://mirror.ccs.tencentyun.com
  tuna      -> https://docker.mirrors.tuna.tsinghua.edu.cn
  aliyun    -> requires --aliyun-mirror https://<id>.mirror.aliyuncs.com
  all       -> tencent + tuna (+ aliyun if provided)

Examples:
  sudo docker/scripts/configure-docker-mirrors-cn.sh --preset tencent
  sudo docker/scripts/configure-docker-mirrors-cn.sh --preset tuna
  sudo docker/scripts/configure-docker-mirrors-cn.sh --preset aliyun --aliyun-mirror https://xxxxxx.mirror.aliyuncs.com
  sudo docker/scripts/configure-docker-mirrors-cn.sh --preset all --aliyun-mirror https://xxxxxx.mirror.aliyuncs.com
EOF
}

PRESET="tencent"
ALIYUN_MIRROR=""

while [[ $# -gt 0 ]]; do
  case "$1" in
    -h|--help) usage; exit 0 ;;
    --preset) PRESET="$2"; shift 2 ;;
    --aliyun-mirror) ALIYUN_MIRROR="$2"; shift 2 ;;
    *) echo "Unknown arg: $1" >&2; usage; exit 2 ;;
  esac
done

if [[ "${EUID:-$(id -u)}" -ne 0 ]]; then
  echo "Please run as root (use sudo)." >&2
  exit 1
fi

mirrors=()
case "$PRESET" in
  tencent)
    mirrors+=( "https://mirror.ccs.tencentyun.com" )
    ;;
  tuna)
    mirrors+=( "https://docker.mirrors.tuna.tsinghua.edu.cn" )
    ;;
  aliyun)
    if [[ -z "$ALIYUN_MIRROR" ]]; then
      echo "--aliyun-mirror is required for preset=aliyun" >&2
      exit 2
    fi
    mirrors+=( "$ALIYUN_MIRROR" )
    ;;
  all)
    mirrors+=( "https://mirror.ccs.tencentyun.com" )
    mirrors+=( "https://docker.mirrors.tuna.tsinghua.edu.cn" )
    if [[ -n "$ALIYUN_MIRROR" ]]; then
      mirrors+=( "$ALIYUN_MIRROR" )
    fi
    ;;
  *)
    echo "Invalid preset: $PRESET" >&2
    usage
    exit 2
    ;;
esac

mkdir -p /etc/docker

json_mirrors=$(printf '"%s",' "${mirrors[@]}" | sed 's/,$//')
cat >/etc/docker/daemon.json <<EOF
{
  "registry-mirrors": [${json_mirrors}]
}
EOF

systemctl daemon-reload
systemctl restart docker

echo "Configured registry mirrors:"
docker info 2>/dev/null | awk '/Registry Mirrors:/,0' | sed -n '1,20p' || true

