#!/bin/bash

case "${1:-}" in
    sh | /bin/sh | bash | /bin/bash)
        exec "$@"
        ;;
esac

if ! /app/docker/scripts/check-production-secrets.sh; then
    exit 1
fi

# Check if STORAGE_DIR is set
if [ -z "$STORAGE_DIR" ]; then
    echo "================================================================"
    echo "⚠️  ⚠️  ⚠️  WARNING: STORAGE_DIR environment variable is not set! ⚠️  ⚠️  ⚠️"
    echo ""
    echo "Not setting this will result in data loss on container restart since"
    echo "the application will not have a persistent storage location."
    echo "It can also result in weird errors in various parts of the application."
    echo ""
    echo "Please run the container with the official docker command at"
    echo "https://github.com/AlataChan/octopus_studio"
    echo ""
    echo "⚠️  ⚠️  ⚠️  WARNING: STORAGE_DIR environment variable is not set! ⚠️  ⚠️  ⚠️"
    echo "================================================================"
fi

{
  cd /app/server/ || exit 1

  SCHEMA_PATH="./prisma/schema.prisma"
  PRISMA_SYNC_CMD=(npx prisma migrate deploy --schema="$SCHEMA_PATH")
  if [[ "${DATABASE_URL:-}" =~ ^postgres(ql)?:// ]]; then
    SCHEMA_PATH="./prisma/postgres/schema.prisma"
    PRISMA_SYNC_CMD=(npx prisma db push --schema="$SCHEMA_PATH" --skip-generate)
  fi

  if ! npx prisma generate --schema="$SCHEMA_PATH"; then
    echo "ERROR: prisma generate failed for $SCHEMA_PATH; continuing startup may fail" >&2
  fi

  if ! "${PRISMA_SYNC_CMD[@]}"; then
    echo "WARNING: prisma migration deploy failed for $SCHEMA_PATH, continuing startup" >&2
  fi

  if [ "${ALATA_DOCKER_BOOTSTRAP_COMPLETE:-true}" != "false" ]; then
    node /app/docker/scripts/bootstrap-complete-deployment.js
  fi

  node /app/server/index.js
} &
{ node /app/collector/index.js; } &
wait -n
exit $?
