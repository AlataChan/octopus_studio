#!/usr/bin/env bash

set -e

if [ "${NODE_ENV:-}" != "production" ] && [ "${REQUIRE_PRODUCTION_SECRETS:-}" != "true" ]; then
  exit 0
fi

GENERATION_HINT="openssl rand -hex 32"
REQUIRED_SECRETS="JWT_SECRET AUTH_TOKEN SIG_KEY SIG_SALT"
OPTIONAL_SECRETS="INTERNAL_API_SECRET ALATA_GATEWAY_API_KEY"
has_error=0

value_for() {
  eval "printf '%s' \"\${$1:-}\""
}

is_placeholder_secret() {
  value="$(printf '%s' "$1" | tr '[:upper:]' '[:lower:]')"

  case "$value" in
    *change-me* | *changeme* | your-* | *example* | *placeholder*)
      return 0
      ;;
    *)
      return 1
      ;;
  esac
}

fatal() {
  echo "FATAL: $1" >&2
  has_error=1
}

for secret_name in $REQUIRED_SECRETS; do
  secret_value="$(value_for "$secret_name")"

  if [ -z "$secret_value" ]; then
    fatal "$secret_name is required for production. Generate a value with: $GENERATION_HINT"
    continue
  fi

  if is_placeholder_secret "$secret_value"; then
    fatal "$secret_name contains a placeholder value. Generate a value with: $GENERATION_HINT"
  fi
done

for secret_name in $OPTIONAL_SECRETS; do
  secret_value="$(value_for "$secret_name")"

  if [ -z "$secret_value" ]; then
    if [ "${REQUIRE_PRODUCTION_SECRETS:-}" = "true" ]; then
      fatal "$secret_name is required when REQUIRE_PRODUCTION_SECRETS=true. Generate a value with: $GENERATION_HINT"
    else
      echo "WARNING: optional production secret $secret_name is unset. Set it if this topology uses the gateway/runtime bridge." >&2
    fi
    continue
  fi

  if is_placeholder_secret "$secret_value"; then
    fatal "$secret_name contains a placeholder value. Generate a value with: $GENERATION_HINT"
  fi
done

if [ "$has_error" -ne 0 ]; then
  exit 1
fi
