#!/usr/bin/env bash
# Quick health check for the demo services set up by deploy.sh.
set -euo pipefail

LAN_IP="${LAN_IP:-$(ipconfig getifaddr en0 2>/dev/null || ipconfig getifaddr en1 2>/dev/null || echo "127.0.0.1")}"

check() {
  local name="$1" url="$2"
  local code
  code="$(curl -s -o /dev/null -w '%{http_code}' --max-time 3 "$url" || echo "000")"
  if [[ "$code" == "000" ]]; then
    printf "  %-22s DOWN   (%s)\n" "$name" "$url"
  else
    printf "  %-22s up     (%s, HTTP %s)\n" "$name" "$url" "$code"
  fi
}

echo "launchd:"
launchctl print "gui/$(id -u)/com.plaashek.api" >/dev/null 2>&1 \
  && echo "  com.plaashek.api      loaded" || echo "  com.plaashek.api      NOT loaded"
launchctl print "gui/$(id -u)/com.plaashek.caddy" >/dev/null 2>&1 \
  && echo "  com.plaashek.caddy    loaded" || echo "  com.plaashek.caddy    NOT loaded"

echo
echo "HTTP (from this Mac, LAN IP $LAN_IP):"
check "API"        "http://$LAN_IP:8080/"
check "Management" "http://$LAN_IP:5177/"
check "Admin"       "http://$LAN_IP:5173/"
check "Field"       "http://$LAN_IP:5174/"
check "Owner"       "http://$LAN_IP:5175/"

echo
echo "Postgres:"
pg_isready -q && echo "  up" || echo "  DOWN"
