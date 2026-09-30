#!/usr/bin/env bash
# One-shot setup + redeploy for a private demo server on an Apple Silicon Mac.
#
# First run: installs Homebrew deps, builds everything, creates the central
# database, seeds the demo farm (in its own database, ADR 0015), and registers
# two launchd services (API + Caddy) so the demo survives a reboot.
#
# Later runs (after `git pull`): rebuilds and restarts the services, leaving
# the databases and services/hek/.env alone. Pass --seed to wipe and recreate
# the demo farm (plaashek:seed only ever touches the Mooiplaas database).
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
HEK="$REPO_ROOT/services/hek"
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

echo "==> Installing/updating brew packages (node, php, composer, mariadb, caddy)"
brew install node php composer mariadb caddy >/dev/null

BREW_PREFIX="$(brew --prefix)"

echo "==> Starting MariaDB"
# `|| true`: a MariaDB already running outside this service (or a stale
# launchd registration) makes the start command fail — the ping loop below
# is the real gate.
brew services start mariadb >/dev/null 2>&1 || true
for i in $(seq 1 30); do
  mysqladmin ping --silent 2>/dev/null && break
  sleep 1
done
mysqladmin ping --silent || { echo "MariaDB did not come up in time" >&2; exit 1; }

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
# 4. Install
# ---------------------------------------------------------------------------
echo "==> pnpm install"
pnpm install --frozen-lockfile

echo "==> composer install (services/hek)"
(cd "$HEK" && composer install --no-dev --optimize-autoloader --no-interaction --quiet)

# ---------------------------------------------------------------------------
# 5. Database user and services/hek/.env (generated once; re-runs keep
#    existing secrets). The user owns the central database and may make farm
#    databases itself (FARM_DB_AUTO_CREATE) — a demo box may, cPanel may not.
# ---------------------------------------------------------------------------
DB_USER="plaashek"
if [[ ! -f "$HEK/.env" ]]; then
  echo "==> Creating the MariaDB user and services/hek/.env"
  FIRST_RUN=true
  DB_PASSWORD="$(openssl rand -hex 16)"
  mysql -u root <<SQL
CREATE USER IF NOT EXISTS '$DB_USER'@'localhost' IDENTIFIED BY '$DB_PASSWORD';
ALTER USER '$DB_USER'@'localhost' IDENTIFIED BY '$DB_PASSWORD';
GRANT ALL PRIVILEGES ON \`plaashek\`.* TO '$DB_USER'@'localhost';
GRANT ALL PRIVILEGES ON \`plaashek\\_f\\_%\`.* TO '$DB_USER'@'localhost';
CREATE DATABASE IF NOT EXISTS plaashek CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
FLUSH PRIVILEGES;
SQL
  cat > "$HEK/.env" <<EOF
APP_NAME=Plaashek
APP_ENV=production
APP_KEY=
APP_DEBUG=false
APP_URL=$API_URL
LOG_CHANNEL=single
LOG_LEVEL=error
DB_HOST=localhost
DB_DATABASE=plaashek
DB_USERNAME=$DB_USER
DB_PASSWORD=$DB_PASSWORD
FARM_DB_PREFIX=plaashek_
FARM_DB_AUTO_CREATE=true
TICKET_SIGNING_KEY_JWK=
STAFF_SESSION_SECRET=
MANAGEMENT_SESSION_SECRET=
CORS_ORIGINS=http://$LAN_IP:$ADMIN_PORT,http://$LAN_IP:$FIELD_PORT,http://$LAN_IP:$OWNER_PORT,http://$LAN_IP:$MANAGEMENT_PORT,http://localhost:$ADMIN_PORT,http://localhost:$FIELD_PORT,http://localhost:$OWNER_PORT,http://localhost:$MANAGEMENT_PORT
FIELD_APP_URL=http://$LAN_IP:$FIELD_PORT
CACHE_STORE=file
EOF
  (cd "$HEK" && php artisan key:generate --force --no-interaction && php artisan plaashek:keys --no-interaction)
else
  echo "==> services/hek/.env already exists, leaving it as-is"
  FIRST_RUN=false
fi

# ---------------------------------------------------------------------------
# 6. Point each PWA at the API, then build them
# ---------------------------------------------------------------------------
for app in admin field owner management; do
  echo "VITE_API_URL=$API_URL" > "$REPO_ROOT/apps/$app/.env.production"
done

echo "==> Building all four PWAs"
pnpm build

# ---------------------------------------------------------------------------
# 7. Migrate (central, then every farm database) + (optionally) seed
# ---------------------------------------------------------------------------
echo "==> Running migrations"
(cd "$HEK" && php artisan migrate --force --no-interaction && php artisan plaashek:farms-migrate --no-interaction)

if [[ "$SEED" == "true" || "${FIRST_RUN:-false}" == "true" ]]; then
  echo "==> Seeding demo farm (Mooiplaas)"
  (cd "$HEK" && php artisan plaashek:seed --no-interaction)
else
  echo "==> Skipping seed (pass --seed to reseed the demo farm)"
fi

# Plaashek Management has no self-signup (staff-only console) — bootstrap one
# login with php artisan plaashek:staff-create. The password is generated
# once and kept in generated/staff-credentials.txt (git-ignored) so redeploys
# don't rotate it out from under you; delete that file to force a new one.
CREDS_FILE="$GEN_DIR/staff-credentials.txt"
if [[ -f "$CREDS_FILE" ]]; then
  # Existing file wins over $STAFF_EMAIL so a redeploy without that var set
  # can't upsert a second, different account under the default email.
  STAFF_EMAIL="$(sed -n 's/^email: //p' "$CREDS_FILE")"
  STAFF_PASSWORD="$(sed -n 's/^password: //p' "$CREDS_FILE")"
else
  STAFF_EMAIL="${STAFF_EMAIL:-staff@plaashek.local}"
  STAFF_PASSWORD="$(openssl rand -hex 12)"
fi
echo "==> Bootstrapping Plaashek Management login ($STAFF_EMAIL)"
(cd "$HEK" && php artisan plaashek:staff-create --email="$STAFF_EMAIL" --password="$STAFF_PASSWORD" --no-interaction)
cat > "$CREDS_FILE" <<EOF
email: $STAFF_EMAIL
password: $STAFF_PASSWORD
EOF
chmod 600 "$CREDS_FILE"

# ---------------------------------------------------------------------------
# 8. launchd: API service (PHP's built-in server with four workers: plenty
#    for a demo; production runs behind LiteSpeed on Afrihost)
# ---------------------------------------------------------------------------
API_PLIST="$HOME/Library/LaunchAgents/com.plaashek.api.plist"
PHP_BIN="$(command -v php)"

mkdir -p "$GEN_DIR/logs"
cat > "$API_PLIST" <<EOF
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>Label</key><string>com.plaashek.api</string>
  <key>ProgramArguments</key>
  <array>
    <string>$PHP_BIN</string>
    <string>artisan</string>
    <string>serve</string>
    <string>--host=0.0.0.0</string>
    <string>--port=$API_PORT</string>
  </array>
  <key>WorkingDirectory</key><string>$HEK</string>
  <key>EnvironmentVariables</key>
  <dict>
    <key>PATH</key><string>$BREW_PREFIX/bin:/usr/bin:/bin</string>
    <key>PHP_CLI_SERVER_WORKERS</key><string>4</string>
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
# 9. Caddy: static file server for the four PWAs (one port each, no DNS)
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
# 10. Summary
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
echo "  Management login:  $STAFF_EMAIL / $STAFF_PASSWORD"
echo "  Demo farm: Mooiplaas"
echo "  Admin login:        admin@mooiplaas.test / mooi1234"
echo "  Owner login:        eienaar@mooiplaas.test / mooi1234"
echo
echo "Logins are also saved in $CREDS_FILE"
echo "Logs: $GEN_DIR/logs/ and services/hek/storage/logs/"
echo "Status: infra/deploy/mac/status.sh"
echo "==================================================================="
