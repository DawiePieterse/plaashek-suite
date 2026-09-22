#!/usr/bin/env bash
# One-shot setup + redeploy for a private demo server on an Apple Silicon Mac.
#
# First run: installs Homebrew deps, builds everything, creates the DB,
# seeds the demo farm, and registers two launchd services (API + Caddy)
# so the demo survives a reboot.
#
# Later runs (after `git pull`): rebuilds and restarts the services, leaving
# the database and .env alone. Pass --seed to wipe and recreate the demo
# farm (services/api/scripts/seed.ts only ever touches the demo org).
#
# No domain/DNS needed: everything is served by IP:port over the LAN, so any
# phone/laptop on the same Wi-Fi can reach it. See docs/deploy-mac.md.
set -euo pipefail

SEED=false
for arg in "$@"; do
  case "$arg" in
    --seed) SEED=true ;;
    *) echo "Unknown argument: $arg" >&2; exit 1 ;;
  esac
done

if [[ "$(uname)" != "Darwin" ]]; then
  echo "This script is for macOS. See docs/deploy-mac.md for other platforms." >&2
  exit 1
fi

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../../.." && pwd)"
GEN_DIR="$REPO_ROOT/infra/deploy/mac/generated"
mkdir -p "$GEN_DIR"
cd "$REPO_ROOT"

echo "==> Repo: $REPO_ROOT"

# ---------------------------------------------------------------------------
# 1. Homebrew deps
# ---------------------------------------------------------------------------
if ! command -v brew &>/dev/null; then
  echo "Homebrew is required. Install it from https://brew.sh and re-run this script." >&2
  exit 1
fi

echo "==> Installing/updating brew packages (node, postgresql@16, caddy)"
brew install node postgresql@16 caddy >/dev/null

BREW_PREFIX="$(brew --prefix)"
PG_BIN="$BREW_PREFIX/opt/postgresql@16/bin"
export PATH="$PG_BIN:$PATH"

echo "==> Starting Postgres"
brew services start postgresql@16 >/dev/null
for i in $(seq 1 30); do
  pg_isready -q && break
  sleep 1
done
pg_isready -q || { echo "Postgres did not come up in time" >&2; exit 1; }

# ---------------------------------------------------------------------------
# 2. pnpm (pinned to match CI)
# ---------------------------------------------------------------------------
if ! command -v corepack &>/dev/null; then
  echo "corepack (bundled with Node 20+) not found on PATH after brew install node." >&2
  exit 1
fi
corepack enable
corepack prepare pnpm@12.4.2 --activate

# ---------------------------------------------------------------------------
# 3. LAN IP — how phones/laptops on the same Wi-Fi will reach this Mac
# ---------------------------------------------------------------------------
LAN_IP="${LAN_IP:-}"
if [[ -z "$LAN_IP" ]]; then
  LAN_IP="$(ipconfig getifaddr en0 2>/dev/null || true)"
fi
if [[ -z "$LAN_IP" ]]; then
  LAN_IP="$(ipconfig getifaddr en1 2>/dev/null || true)"
fi
if [[ -z "$LAN_IP" ]]; then
  echo "Could not auto-detect a LAN IP. Set LAN_IP=x.x.x.x and re-run." >&2
  exit 1
fi
echo "==> LAN IP: $LAN_IP (set LAN_IP=... to override)"

API_PORT=8080
ADMIN_PORT=5173
FIELD_PORT=5174
OWNER_PORT=5175
MANAGEMENT_PORT=5177

API_URL="http://$LAN_IP:$API_PORT"

# ---------------------------------------------------------------------------
# 4. Install (needed before .env generation, which shells out to a script
#    under services/api that imports a dependency)
# ---------------------------------------------------------------------------
echo "==> pnpm install"
pnpm install --frozen-lockfile

# ---------------------------------------------------------------------------
# 5. Database
# ---------------------------------------------------------------------------
DB_NAME="plaashek_demo"
if ! psql -X -tA -c "SELECT 1 FROM pg_database WHERE datname='$DB_NAME'" postgres | grep -q 1; then
  echo "==> Creating database $DB_NAME"
  createdb "$DB_NAME"
else
  echo "==> Database $DB_NAME already exists"
fi
DATABASE_URL="postgres://$(whoami)@localhost:5432/$DB_NAME"

# ---------------------------------------------------------------------------
# 6. .env (generated once; re-runs keep existing secrets)
# ---------------------------------------------------------------------------
if [[ ! -f "$REPO_ROOT/.env" ]]; then
  echo "==> Generating .env"
  FIRST_RUN=true
  TICKET_SIGNING_KEY_JWK="$(node services/api/scripts/generate-signing-key.mjs)"
  STAFF_SESSION_SECRET="$(openssl rand -hex 32)"
  MANAGEMENT_SESSION_SECRET="$(openssl rand -hex 32)"
  cat > "$REPO_ROOT/.env" <<EOF
DATABASE_URL=$DATABASE_URL
TICKET_SIGNING_KEY_JWK=$TICKET_SIGNING_KEY_JWK
STAFF_SESSION_SECRET=$STAFF_SESSION_SECRET
MANAGEMENT_SESSION_SECRET=$MANAGEMENT_SESSION_SECRET
PORT=$API_PORT
CORS_ORIGINS=http://$LAN_IP:$ADMIN_PORT,http://$LAN_IP:$FIELD_PORT,http://$LAN_IP:$OWNER_PORT,http://$LAN_IP:$MANAGEMENT_PORT,http://localhost:$ADMIN_PORT,http://localhost:$FIELD_PORT,http://localhost:$OWNER_PORT,http://localhost:$MANAGEMENT_PORT
FIELD_APP_URL=http://$LAN_IP:$FIELD_PORT
MEDIA_BUCKET_URL=
MEDIA_BUCKET_KEY=
MEDIA_BUCKET_SECRET=
WHATSAPP_API_TOKEN=
EOF
else
  echo "==> .env already exists, leaving it as-is"
  FIRST_RUN=false
fi

# ---------------------------------------------------------------------------
# 7. Point each PWA at the API, then build everything
# ---------------------------------------------------------------------------
for app in admin field owner management; do
  echo "VITE_API_URL=$API_URL" > "$REPO_ROOT/apps/$app/.env.production"
done

echo "==> Building (schema, api, all four PWAs)"
pnpm build

# ---------------------------------------------------------------------------
# 8. Migrate + (optionally) seed
# ---------------------------------------------------------------------------
echo "==> Running migrations"
pnpm migrate

if [[ "$SEED" == "true" || "${FIRST_RUN:-false}" == "true" ]]; then
  echo "==> Seeding demo farm (Mooiplaas)"
  pnpm seed
else
  echo "==> Skipping seed (pass --seed to reseed the demo farm)"
fi

# ---------------------------------------------------------------------------
# 9. launchd: API service
# ---------------------------------------------------------------------------
API_PLIST="$HOME/Library/LaunchAgents/com.plaashek.api.plist"
NODE_BIN="$(command -v node)"

mkdir -p "$GEN_DIR/logs"
cat > "$API_PLIST" <<EOF
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>Label</key><string>com.plaashek.api</string>
  <key>ProgramArguments</key>
  <array>
    <string>$NODE_BIN</string>
    <string>$REPO_ROOT/services/api/dist/index.js</string>
  </array>
  <key>WorkingDirectory</key><string>$REPO_ROOT/services/api</string>
  <key>EnvironmentVariables</key>
  <dict>
    <key>PATH</key><string>$BREW_PREFIX/bin:/usr/bin:/bin</string>
  </dict>
  <key>RunAtLoad</key><true/>
  <key>KeepAlive</key><true/>
  <key>StandardOutPath</key><string>$GEN_DIR/logs/api.log</string>
  <key>StandardErrorPath</key><string>$GEN_DIR/logs/api.error.log</string>
</dict>
</plist>
EOF

launchctl bootout "gui/$(id -u)/com.plaashek.api" 2>/dev/null || true
launchctl bootstrap "gui/$(id -u)" "$API_PLIST"
launchctl kickstart -k "gui/$(id -u)/com.plaashek.api"

# ---------------------------------------------------------------------------
# 10. Caddy: static file server for the four PWAs (one port each, no DNS)
# ---------------------------------------------------------------------------
cat > "$GEN_DIR/Caddyfile" <<EOF
:$ADMIN_PORT {
  root * $REPO_ROOT/apps/admin/dist
  encode gzip
  try_files {path} /index.html
  file_server
}
:$FIELD_PORT {
  root * $REPO_ROOT/apps/field/dist
  encode gzip
  try_files {path} /index.html
  file_server
}
:$OWNER_PORT {
  root * $REPO_ROOT/apps/owner/dist
  encode gzip
  try_files {path} /index.html
  file_server
}
:$MANAGEMENT_PORT {
  root * $REPO_ROOT/apps/management/dist
  encode gzip
  try_files {path} /index.html
  file_server
}
EOF

CADDY_PLIST="$HOME/Library/LaunchAgents/com.plaashek.caddy.plist"
CADDY_BIN="$(command -v caddy)"
cat > "$CADDY_PLIST" <<EOF
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>Label</key><string>com.plaashek.caddy</string>
  <key>ProgramArguments</key>
  <array>
    <string>$CADDY_BIN</string>
    <string>run</string>
    <string>--config</string>
    <string>$GEN_DIR/Caddyfile</string>
    <string>--adapter</string>
    <string>caddyfile</string>
  </array>
  <key>WorkingDirectory</key><string>$GEN_DIR</string>
  <key>RunAtLoad</key><true/>
  <key>KeepAlive</key><true/>
  <key>StandardOutPath</key><string>$GEN_DIR/logs/caddy.log</string>
  <key>StandardErrorPath</key><string>$GEN_DIR/logs/caddy.error.log</string>
</dict>
</plist>
EOF

launchctl bootout "gui/$(id -u)/com.plaashek.caddy" 2>/dev/null || true
launchctl bootstrap "gui/$(id -u)" "$CADDY_PLIST"
launchctl kickstart -k "gui/$(id -u)/com.plaashek.caddy"

# ---------------------------------------------------------------------------
# 11. Summary
# ---------------------------------------------------------------------------
sleep 1
echo
echo "==================================================================="
echo "Deployed. On this Mac or any device on the same Wi-Fi:"
echo
echo "  Plaashek Management  http://$LAN_IP:$MANAGEMENT_PORT"
echo "  Farm Admin Tool      http://$LAN_IP:$ADMIN_PORT"
echo "  Field (phones)       http://$LAN_IP:$FIELD_PORT"
echo "  Owner rollup         http://$LAN_IP:$OWNER_PORT"
echo "  API                  $API_URL"
echo
if [[ "$SEED" == "true" || "${FIRST_RUN:-false}" == "true" ]]; then
  echo "  Demo farm: Mooiplaas"
  echo "  Admin login:  admin@mooiplaas.test / mooi1234"
  echo "  Owner login:  eienaar@mooiplaas.test / mooi1234"
  echo
fi
echo "Logs: $GEN_DIR/logs/"
echo "Status: infra/deploy/mac/status.sh"
echo "==================================================================="
