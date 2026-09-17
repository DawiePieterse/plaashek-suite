#!/usr/bin/env bash
# Nightly Postgres dump, off the app server, retained 30 days (plan §10).
set -euo pipefail

: "${DATABASE_URL:?Set DATABASE_URL}"
: "${BACKUP_DIR:=./backups}"

mkdir -p "$BACKUP_DIR"
stamp=$(date -u +%Y%m%dT%H%M%SZ)
out="$BACKUP_DIR/plaashek-$stamp.dump"

pg_dump "$DATABASE_URL" --format=custom --file="$out"
echo "Backed up to $out"

find "$BACKUP_DIR" -name 'plaashek-*.dump' -mtime +30 -delete
