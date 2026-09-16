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
| `apps/owner` | Eienaar, read-only |
| `apps/field-*` | Field PWAs. `app.plaashek.co.za` |
| `apps/_template-field` | Copy this to start a new field module |
| `packages/*` | Shared schema, sync, tickets, local store, UI |
| `services/api` | hek-api + sync-api |
| `services/migrations` | Postgres migrations, numbered, checked in |
| `infra/seed` | Fake farm for Phase 1 exit tests |
| `infra/backup` | Nightly script + quarterly restore drill |

## Rules that are easy to break later

- No cross-farm foreign keys. Ever.
- Every workspace row carries `farm_id`, `module_code`, `season_id`,
  `created_by`, `device_id`.
- `season_id` resolves **on the device** from its synced copy, not on the
  server at sync time.
- A save is never blocked by missing config. No active season → save anyway,
  flag for the office.
- Field workers never see billing copy.
- A phone shows only modules whose QR it has scanned, even if the farm is
  licensed for more.

## Getting started

```
pnpm install
cp .env.example .env     # fill it in
pnpm seed                # fake farm for testing
```

## Phase 1 exit checklist

Lives in `docs/decisions/` once the Phase 0 answers are in. Until then, see
§12 of the plan.
