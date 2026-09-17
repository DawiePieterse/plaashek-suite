# Plaashek Suite

Greenfield build. See `docs/PLAASHEK-SUITE-PLAN.md` for the plan — that file is
the only working plan; earlier drafts are retired.

The four existing apps (Boord, Boord Owner, Notes, Kudde), wherever they
currently live, are **reference only**. Nothing here imports from them. Reuse
a screen or a data shape by copying it in and adapting it to outbox +
`farm_id` + no field login. Otherwise rebuild.

## Layout

| Path | What it is |
|---|---|
| `apps/management` | Staff only. `hek.plaashek.co.za` |
| `apps/admin` | Farm office. `admin.plaashek.co.za` |
| `apps/field` | Pairing shell for the phones. `app.plaashek.co.za` |
| `packages/*` | Shared schema, sync, tickets, master data |
| `services/api` | hek-api + sync-api |
| `services/migrations` | Postgres migrations, numbered, checked in |
| `infra/seed` | Fake farm for Phase 1 exit tests |
| `infra/backup` | Nightly script + quarterly restore drill |

`apps/field-*`, `apps/owner`, and a field-app template land in Phase 2/3 (plan §11), not before — no scaffolding for a phase that hasn't started.

## Rules that are easy to break later

- No cross-farm foreign keys. Ever.
- Every workspace row carries `farm_id`, `module_code`, `season_id`,
  `created_by`, `device_id`.
- `season_id` resolves **on the device** from its synced copy, not on the
  server at sync time.
- A save is never blocked by missing config. No active season → save anyway,
  flag for the office.
- Screen language is the farm's own (`farms.language`, `af` or `en`), picked when
  the farm is set up. English in the database, the farm's language on screen.
  The office reads it from the login response, the phone from its ticket.
- Field workers never see billing copy.
- A phone shows only modules whose QR it has scanned, even if the farm is
  licensed for more.

## Getting started

```
pnpm install
cp .env.example .env     # fill it in
pnpm migrate             # apply services/migrations
pnpm seed                # fake farm for testing (--lang=en for an English farm)

pnpm --filter @plaashek/api dev      # http://localhost:8080
pnpm --filter @plaashek/admin dev    # http://localhost:5173
pnpm --filter @plaashek/field dev    # http://localhost:5174 — open /pair/<token>
```

The seed prints the office logins. API tests need `DATABASE_URL` in the
environment — they do not read `.env`.

## Phase 1 exit checklist

Closed 17 September 2026 — see §12 of the plan. Foundation (tickets, sync,
pairing, licence lifecycle, seasons, outbox migration) is done.

## Phase 2 exit checklist

Closed 17 September 2026 — see §12 of the plan. Real veldnotas capture
(GPS stamp, weather via `/weather/current`, offline badge, correction model)
is done; Phase 3 (`boord` + `eienaar`) is next.
