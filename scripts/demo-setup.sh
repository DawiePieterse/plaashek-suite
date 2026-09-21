#!/usr/bin/env bash
# One-shot setup for a local demo: writes .env, runs migrations, seeds the
# fake demo farm. Safe to re-run — it won't overwrite an existing .env.
#
# Requires: Node >=20, pnpm, and a reachable Postgres server (see
# DATABASE_URL below — edit it first if your local Postgres needs a
# different user/password/host).
set -euo pipefail

cd "$(dirname "$0")/.."

echo "Installing dependencies..."
pnpm install

if [ -f .env ]; then
  echo ".env already exists — leaving it alone. Delete it first if you want a fresh one."
else
  echo "Writing .env..."
  cp .env.example .env

  # generate-signing-key.mjs needs services/api's node_modules (jose), hence
  # this runs after `pnpm install` above.
  JWK=$(node services/api/scripts/generate-signing-key.mjs)
  STAFF_SECRET=$(node -e "console.log(require('crypto').randomBytes(32).toString('hex'))")
  MGMT_SECRET=$(node -e "console.log(require('crypto').randomBytes(32).toString('hex'))")

  # BSD sed (macOS) needs `-i ''`; GNU sed (Linux) needs `-i`.
  SED_INPLACE=(-i)
  if [[ "$OSTYPE" == darwin* ]]; then
    SED_INPLACE=(-i '')
  fi

  sed "${SED_INPLACE[@]}" \
    -e "s#^TICKET_SIGNING_KEY_JWK=.*#TICKET_SIGNING_KEY_JWK=${JWK}#" \
    -e "s#^STAFF_SESSION_SECRET=.*#STAFF_SESSION_SECRET=${STAFF_SECRET}#" \
    -e "s#^MANAGEMENT_SESSION_SECRET=.*#MANAGEMENT_SESSION_SECRET=${MGMT_SECRET}#" \
    -e "s#^FIELD_APP_URL=.*#FIELD_APP_URL=http://localhost:5174#" \
    .env

  echo "Wrote .env. DATABASE_URL defaults to postgres://localhost:5432/plaashek_dev — edit .env now if yours differs."
fi

echo "Applying migrations..."
pnpm migrate

echo "Seeding demo farm..."
pnpm seed

cat <<'EOF'

Setup done. Start the demo apps (each in its own terminal, or backgrounded):

  pnpm --filter @plaashek/api dev      # http://localhost:8080
  pnpm --filter @plaashek/admin dev    # http://localhost:5173
  pnpm --filter @plaashek/field dev    # http://localhost:5174
  pnpm --filter @plaashek/owner dev    # http://localhost:5175

Then open http://localhost:5173 and log in with the credentials printed
above by the seed step.
EOF
