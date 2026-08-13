#!/usr/bin/env bash
set -euo pipefail

gen() {
  if command -v openssl >/dev/null 2>&1; then
    # 48 bytes -> 64 chars base64-ish after stripping
    openssl rand -base64 48 | tr -d '\n' | tr -d '/+=' | cut -c 1-48
    return
  fi

  if command -v python3 >/dev/null 2>&1; then
    python3 - <<'PY'
import secrets, string
alphabet = string.ascii_letters + string.digits
print(''.join(secrets.choice(alphabet) for _ in range(48)))
PY
    return
  fi

  echo "Missing openssl/python3 to generate secrets" >&2
  exit 2
}

echo "AUTH_TOKEN=$(gen)"
echo "JWT_SECRET=$(gen)"
echo "SIG_KEY=$(gen)"
echo "SIG_SALT=$(gen)"

