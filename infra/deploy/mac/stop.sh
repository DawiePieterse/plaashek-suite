#!/usr/bin/env bash
# Stops the demo services without uninstalling anything. MariaDB is left
# running (brew service) since other things may depend on it; stop it
# separately with `brew services stop mariadb` if needed.
set -euo pipefail

launchctl bootout "gui/$(id -u)/com.plaashek.api" 2>/dev/null || true
launchctl bootout "gui/$(id -u)/com.plaashek.caddy" 2>/dev/null || true

echo "Stopped com.plaashek.api and com.plaashek.caddy."
