# ADR 0015 — One database per farm

**Date:** 30 September 2026
**Status:** accepted

## Question

Until now every farm's rows shared one database, kept apart only by each query
remembering `WHERE farm_id = …` (and `assertFarmOwns` on the ids a request
names). One forgotten filter would show one farm another farm's workers, crates
or pay. Farm data includes farm workers' names, worker numbers and pay (POPIA).
Should farms be kept apart more strongly?

## Decision

Yes: every farm has its own database. A central database holds only what spans
farms.

| Database | Holds |
|---|---|
| central (`plaashek`, on Afrihost `bowlsbg5n9w0_plaashek`) | organisations, farms (with each farm's database name, user and encrypted password), licences (`entitlements`), Plaashek staff, the login directory (email → farm), Plaashek Management's audit log |
| one per farm (`<prefix>f_<slug>`) | people and office logins, phones and pairing, blocks, camps, assets, seasons, every capture, piece rates, held writes, the farm's audit log |

- **How a request finds its farm.** A staff session or device ticket carries
  the farm id; a login looks its email up in the directory; the pairing QR
  token is `<farm slug>-<random>`, because the scan that redeems it has no
  session. `App\Farm\FarmDatabase` then opens that farm's own database, with its
  own database user, and every farm query in the request goes through it.
  Nothing carries over between requests.
- **Creating a farm.** On cPanel the app cannot run `CREATE DATABASE`: the
  operator makes the database and its user in the Database Wizard and enters
  them on Management's "Nuwe plaas" form (or `php artisan plaashek:farm-create`).
  Locally, or on a VPS, `FARM_DB_AUTO_CREATE=true` lets the API make it. Either
  way the farm database is reached and migrated before any central row is
  written, so no farm ever points at nothing.
- **Rows keep `farm_id`**, though the database already says whose they are:
  the README's stamp rule, and a later merge or export needs nothing added.
- **No write spans both databases in one step.** The two that touch both
  (creating a farm, adding an office login) write the side that can fail first,
  and a login is re-checked in the farm's own database every time.

## Why

- **Structural, not remembered.** A query with no farm filter can only see the
  farm it is in. The Pest suite proves it with deliberately careless routes
  (`tests/Feature/IsolationTest.php`), and the full walkthrough checked that a
  second farm's office sees none of the first farm's data.
- **One farm at a time.** Backup is one file per farm
  (`php artisan plaashek:backup`); restoring, handing a farm its data, or
  deleting it on cancellation (plan §10 offboarding) touches that farm only.
- **Works on both hosts.** Postgres row-level security would have been a
  smaller change, but MariaDB has none, and ADR 0014 moves to MariaDB.
- **Nothing to migrate.** No farm had data yet.

What was given up:

- **Setup per farm.** Each farm needs its database and user made in cPanel
  before it is created in Management. Automating that through cPanel's API is a
  follow-up.
- **Database budget.** Bronze Pro allows 20 MariaDB databases, shared with the
  Bowls Buddy clubs and Budgeteer. Plaashek takes one central plus one per farm.
  Silver Pro (100 databases, R179 a month) is the next step.
- **Migrations per farm.** Every update runs `php artisan migrate` (central)
  and `php artisan plaashek:farms-migrate` (every farm). A farm whose migration
  fails is reported by name and does not stop the others.
- **Cross-farm reports need a loop.** Plaashek Management reads only central
  data today. A report across farms (usage, say) opens each farm's database in
  turn.

## Consequences

- `services/hek/database/migrations/central` and `.../farm` hold the two
  schemas. The Postgres partial unique indexes became a plain unique key
  (worker numbers: MariaDB lets nulls repeat) and a stored generated column
  (one active season per farm).
- Tests run against real per-farm databases (`plaashek_test_f_*`).
- A database user per farm is what cPanel gives by default. It keeps even a
  compromised farm connection inside its own farm. The API holds every farm's
  password (encrypted with `APP_KEY`), so it does not protect against a
  compromised API.
