#!/usr/bin/env bash
# Restores one dump from `php artisan plaashek:backup` into a throwaway
# database: the quarterly drill (plan §10). Never point it at a live database.
#
#   infra/backup/restore.sh <dump.sql.gz> <throwaway database>
#
# Uses the usual mysql client settings (~/.my.cnf, or MYSQL_PWD with -u in
# MYSQL_USER). Each farm is its own file, so a drill restores one farm.
set -euo pipefail

dump="${1:?Usage: restore.sh <dump.sql.gz> <throwaway database>}"
target="${2:?Usage: restore.sh <dump.sql.gz> <throwaway database>}"
user_arg=()
[[ -n "${MYSQL_USER:-}" ]] && user_arg=(-u "$MYSQL_USER")

mysql "${user_arg[@]}" -e "CREATE DATABASE IF NOT EXISTS \`$target\` CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci"
gunzip -c "$dump" | mysql "${user_arg[@]}" "$target"
echo "Restored $dump into $target"
