# ADR 0014 — The API in PHP, on the Afrihost hosting

**Date:** 30 September 2026
**Status:** accepted. Supersedes [ADR 0002](0002-sync-engine.md)'s PowerSync choice.

## Question

Plan §9 assumed one VPS running a Node API, Postgres and a self-hosted
PowerSync service. None of it existed yet. Plaashek's owner already pays for
Afrihost Bronze Pro cPanel hosting, which runs Bowls Buddy and Budgeteer, and
owns `plaashek.co.za`. That hosting runs PHP 8.3 and MariaDB 10.11 behind
LiteSpeed, with cron, jailed SSH and free certificates, but no Node.js, no
Postgres and no always-on processes. Should Plaashek run there?

## Decision

Yes. The API is rewritten in PHP as a Laravel 12 app, `services/hek`, on
MariaDB, and deployed to that account as zips (`scripts/build-afrihost.sh`,
[docs/deploy-afrihost.md](../deploy-afrihost.md)), the way Budgeteer and Bowls
Buddy are.

- **Same contract.** Every path, JSON shape, error shape
  (`{error: {code, message}}`), status code and ticket claim is kept, so the
  four apps did not change. The one app change is optional database fields on
  Management's "Nuwe plaas" form, for [ADR 0015](0015-one-database-per-farm.md).
- **Same crypto.** Device tickets stay Ed25519 JWTs (`firebase/php-jwt` over
  `sodium`, from the same `TICKET_SIGNING_KEY_JWK`), office sessions stay HS256
  with their two separate secrets. Passwords are bcrypt: there were no real
  users to carry over from scrypt.
- **No PowerSync.** It needs an always-on service beside the database. The
  field app's own outbox (`apps/field/src/queue.ts` posting to
  `POST /sync/upload`), and the lists it caches (`/blocks`, `/pickers`, the
  catalogs), are the sync. They already did the work; they are no longer called
  interim.
- **Gone:** `services/api` (Fastify), `services/migrations` (Drizzle SQL),
  `packages/schema`, `packages/tickets` and `packages/sync`. The Node tests
  were ported case for case to Pest, and run on MariaDB.

## Why

- **No new bill, no new server.** The hosting is paid for, in South Africa,
  backed up (Afrires, 14 days) and already looked after for two other apps.
  A VPS is a second thing to patch, monitor and pay for, for one part-time
  developer.
- **One stack.** Bowls Buddy and Budgeteer are Laravel on the same account.
  Deploying, debugging and backing up Plaashek is now the same routine.
- **Nothing to migrate.** No farm had data yet, so the database could change
  engine without a data move.
- **PowerSync was not yet doing anything.** ADR 0002 bought it, but the field
  app shipped on its own outbox and the Sync Rules were never written. Dropping
  it removes a service, not a feature.

What was given up:

- **The OPFS/SQLite local store.** The outbox is localStorage, about 5 MB and
  synchronous: plenty for text captures, wrong for photos. The photo and voice
  channel (§7) will need the queue moved to IndexedDB. That is a change to one
  file in the field app, not a new service.
- **Pull sync.** The phone reads short lists on demand rather than syncing
  buckets. Right for today's modules; a module that needs the phone to hold a
  large, changing dataset offline will need more than that.
- **Room to grow on one box.** Shared hosting has CPU and memory limits and
  noisy neighbours. The API is stateless and the databases are MariaDB, so a
  move to a VPS or a bigger package is an upload and a database restore, not a
  rewrite.
- **The shared account.** Plaashek runs as the same cPanel user as Bowls Buddy
  and Budgeteer, so a flaw in one could read the others' files. Keeping all
  three patched protects all three; a separate Afrihost account removes the
  link when a farm contract or POPIA review asks for it.

## Consequences

- `services/hek` is the API. `composer check` (Pint, Larastan, Pest) runs in CI
  beside the apps' typecheck, build and tests.
- Every update: build the zips, upload and extract them, then
  `php artisan migrate --force && php artisan plaashek:farms-migrate` in cPanel
  Terminal ([docs/deploy-afrihost.md](../deploy-afrihost.md)).
- Nothing in the API needs to stay running. The only scheduled job is the
  nightly backup.
- Reversing this later means moving `services/hek` and its databases to a VPS,
  not a rewrite: Laravel and MariaDB run there too.
