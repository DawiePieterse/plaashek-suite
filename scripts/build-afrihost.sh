#!/usr/bin/env bash
#
# Builds the files to upload to Afrihost cPanel hosting (docs/deploy-afrihost.md), from the last commit:
#
#   plaashek-hek.zip          the Laravel API with vendor/ -> extract into ~/plaashek-hek (document root: its public/)
#   plaashek-management.zip   Plaashek Management          -> extract into ~/plaashek-management
#   plaashek-admin.zip        Farm Admin Tool              -> extract into ~/plaashek-admin
#   plaashek-field.zip        the field PWA (phones)       -> extract into ~/plaashek-field
#   plaashek-owner.zip        the Owner Module             -> extract into ~/plaashek-owner
#
# Each app zip carries an .htaccess that sends every path that is not a file to index.html, so
# /pair/<token> and the other app routes load. No .env goes in any zip.
#
#   scripts/build-afrihost.sh [api-url] [output-dir]
#
# api-url defaults to https://api.plaashek.co.za and is baked into the apps at build time.
# Needs git, PHP 8.2+, Composer, Node 20+ and pnpm.

set -euo pipefail

API_URL="${1:-https://api.plaashek.co.za}"
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
OUT="$(mkdir -p "${2:-$ROOT/build/afrihost}" && cd "${2:-$ROOT/build/afrihost}" && pwd)"
WORK="$(mktemp -d)"
trap 'rm -rf "$WORK"' EXIT

cd "$ROOT"
if [ -n "$(git status --porcelain -- services/hek apps packages package.json pnpm-lock.yaml pnpm-workspace.yaml)" ]; then
    echo "Commit your changes first: the zips are built from the last commit." >&2
    exit 1
fi

commit=$(git rev-parse --short HEAD)
git archive HEAD | tar -x -C "$WORK"
rm -f "$OUT"/plaashek-*.zip

echo "API (services/hek)..."
(
    cd "$WORK/services/hek"
    COMPOSER_NO_INTERACTION=1 composer install --no-dev --optimize-autoloader --quiet
    find vendor -type d -name .git -prune -exec rm -rf {} +
    rm -rf tests phpunit.xml phpstan.neon pint.json .editorconfig .gitattributes
    mkdir -p storage/framework/{cache/data,sessions,views,testing} storage/logs storage/backups bootstrap/cache
    echo "$commit" > VERSION
    zip -qr -9 "$OUT/plaashek-hek.zip" .
)

echo "Apps, pointed at $API_URL..."
(
    cd "$WORK"
    for app in management admin field owner; do
        echo "VITE_API_URL=$API_URL" > "apps/$app/.env.production"
    done
    pnpm install --frozen-lockfile --silent
    pnpm -r build >/dev/null

    for app in management admin field owner; do
        cat > "apps/$app/dist/.htaccess" <<'EOF'
# Every path that is not a real file is the app itself (its routes, and the field app's /pair/<token>).
RewriteEngine On
RewriteCond %{REQUEST_FILENAME} !-f
RewriteCond %{REQUEST_FILENAME} !-d
RewriteRule ^ index.html [L]

# index.html must never be cached, so a new upload reaches the phones and offices straight away.
<Files "index.html">
    Header set Cache-Control "no-cache"
</Files>
EOF
        (cd "apps/$app/dist" && zip -qr -9 "$OUT/plaashek-$app.zip" .)
    done
)

echo "Checking..."
fail() { echo "BUILD FAILED: $1" >&2; exit 1; }
api="$(unzip -l "$OUT/plaashek-hek.zip")"
grep -q ' vendor/autoload\.php$' <<<"$api" || fail "API: no vendor/autoload.php"
grep -q ' public/index\.php$' <<<"$api" || fail "API: no public/index.php"
grep -q ' public/\.htaccess$' <<<"$api" || fail "API: no public/.htaccess"
grep -q ' database/migrations/farm/' <<<"$api" || fail "API: no farm migrations"
grep -q ' \.env$' <<<"$api" && fail "API: contains a .env file"
grep -q ' vendor/pestphp/' <<<"$api" && fail "API: contains development packages"
for app in management admin field owner; do
    listing="$(unzip -l "$OUT/plaashek-$app.zip")"
    grep -q ' index\.html$' <<<"$listing" || fail "$app: no index.html"
    grep -q ' \.htaccess$' <<<"$listing" || fail "$app: no .htaccess"
    grep -q ' \.env' <<<"$listing" && fail "$app: contains a .env file"
    unzip -p "$OUT/plaashek-$app.zip" 'assets/*.js' | grep -q "$API_URL" || fail "$app: not built against $API_URL"
done

echo "Done ($commit): $OUT"
ls -lh "$OUT"
