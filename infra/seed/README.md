# Seed

"Mooiplaas" — a demo farm modelled on the Bekfontein pilot's known shape
(ADR 0001: litchi, peak picking 1 Sep - 31 Dec), resettable in one command,
so the Phase 1 exit checklist can be re-run in a minute instead of clicked
through. Not real Bekfontein data — none exists yet.

    cd services/hek
    php artisan plaashek:seed            # --lang=en for an English farm

Lives in `services/hek/app/Console/Commands/Seed.php`. Like every farm,
Mooiplaas has its own database (ADR 0015). The first run creates the farm and
its database: made automatically where `FARM_DB_AUTO_CREATE=true` (local, a
VPS), or on cPanel make it in the Database Wizard first and pass
`--db-name=... --db-user=... --db-password=...`. Re-running empties only the
Mooiplaas database and fills it again, so it is safe to run repeatedly and can
never touch another farm.

Creates:

- One organisation, one farm, with its own database
- A few people (no logins — names to stamp with)
- One admin login, one owner login
- Blocks, camps, two assets, one active season
- Licences for six modules, and one module deliberately NOT licensed
  (`kudde`, so the unlicensed-QR-fails test has something to fail against)
