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
| `apps/field` | The phones: pairing shell + Veldnotas, Boord, Span. `app.plaashek.co.za` |
| `apps/owner` | Owner module (`eienaar`). Read-only rollups |
| `packages/*` | Shared schema, sync, tickets, and the office tools' shared UI |
| `services/api` | hek-api + sync-api |
| `services/migrations` | Postgres migrations, numbered, checked in |
| `infra/seed` | Fake farm for Phase 1 exit tests |
| `infra/backup` | Nightly script + quarterly restore drill |

No scaffolding for a phase that hasn't started: a module gets a table, a
screen and a route when it is being built, not before.

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
- Identity on a phone comes from scanned paper — a pairing QR, a worker card —
  never from a list of people on screen (ADR 0009).
- The office tools are one tab per licensed field module plus Farm settings,
  and a tab exists only if Plaashek Management switched that module on. Both
  tools draw the same panels from `packages/ui-office`; the owner's are the
  read-only ones.
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

## Phase 3 exit checklist

Closed 17 September 2026 — see §12 of the plan. `boord` (harvest capture) and
the first `eienaar` rollup are done.

## Phase 4 — first real farm

**Open.** Laughing Waters / Bekfontein exists as a real org, farm and licence,
and Excel export and CI are done. What's left is on-site: real people and
blocks, real pairing, a proven offline day, a revoke on a real phone, and the
backup/restore drill against the farm's own data. Phase 5 runs in parallel
(plan §12) — it closes nothing here.

## Phase 5 — remaining modules

In progress, §11 order. `span` is done (clock in/out on the phone, days and
hours in Eienaar) — see `docs/span-build-scope.md`.

Seasonal piece-work is done too, outside that order: the farm pays its litchi
pickers per kilogram, which Span does not cover. A picker carries a printed
worker card, the scale phone scans it before the weight, and the office sets a
tiered rate and reads the payout — see `docs/piecework-build-scope.md`. It
calculates pay and exports it; it does not issue payslips, move money, or
check the minimum wage (ADR 0010).

`stoor` is next; write its build scope before any code.
