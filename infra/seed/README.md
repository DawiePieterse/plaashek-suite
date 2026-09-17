# Seed

"Mooiplaas" — a demo farm modelled on the Bekfontein pilot's known shape
(ADR 0001: litchi, peak picking 1 Sep - 31 Dec), resettable in one command,
so the Phase 1 exit checklist can be re-run in a minute instead of clicked
through. Not real Bekfontein data — none exists yet.

    pnpm seed

Lives in `services/api/scripts/seed.ts` — that is where the Postgres client,
the Drizzle schema and the password hasher already are, so the seed needs no
dependency wiring of its own. Re-running wipes and recreates everything under
the demo organisation, so it is safe to run repeatedly.

Creates:

- One organisation, one farm
- A few people (no logins — names to stamp with)
- One admin login, one owner login
- Blocks, camps, one active season
- Entitlements for two modules, and one module deliberately NOT licensed
  (so the unlicensed-QR-fails test has something to fail against)
