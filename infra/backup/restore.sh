#!/usr/bin/env bash
# Restores one dump into a target database — the quarterly drill (plan §10).
# Never point RESTORE_DATABASE_URL at the live database.
set -euo pipefail

: "${RESTORE_DATABASE_URL:?Set RESTORE_DATABASE_URL}"
dump="${1:?Usage: restore.sh <dump-file>}"

pg_restore --clean --if-exists --no-owner --dbname="$RESTORE_DATABASE_URL" "$dump"
echo "Restored $dump into $RESTORE_DATABASE_URL"
