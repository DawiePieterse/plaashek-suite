#!/usr/bin/env bash
# Starts the demo services again after stop.sh, without rebuilding.
# Use deploy.sh instead if you've pulled new code.
set -euo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../../.." && pwd)"
API_PLIST="$HOME/Library/LaunchAgents/com.plaashek.api.plist"
CADDY_PLIST="$HOME/Library/LaunchAgents/com.plaashek.caddy.plist"

for plist in "$API_PLIST" "$CADDY_PLIST"; do
  if [[ ! -f "$plist" ]]; then
    echo "$plist not found — run deploy.sh first." >&2
    exit 1
  fi
done

brew services start postgresql@16 >/dev/null

launchctl bootstrap "gui/$(id -u)" "$API_PLIST" 2>/dev/null || true
launchctl kickstart -k "gui/$(id -u)/com.plaashek.api"

launchctl bootstrap "gui/$(id -u)" "$CADDY_PLIST" 2>/dev/null || true
launchctl kickstart -k "gui/$(id -u)/com.plaashek.caddy"

echo "Started. Run $REPO_ROOT/infra/deploy/mac/status.sh to check."
