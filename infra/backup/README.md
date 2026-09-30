# Backup

- Nightly dump of the central database and **every farm database, one file
  each**, retained 30 days: `php artisan plaashek:backup` in `services/hek`
  (files go to `services/hek/storage/backups/`, or `--dir=`). Cron it on the
  server, and copy the folder off it. On Afrihost: cPanel > Cron Jobs, see
  `docs/deploy-afrihost.md`.
- One file per farm means one farm can be restored, handed its data, or
  deleted without touching another (ADR 0015).
- Afrihost's own Afrires keeps 14 days of every database too, restored by
  support ticket only — the nightly dump is the copy we control.
- Media bucket versioned (when there is one).
- **Restore tested quarterly.** Diarise it. An untested backup is a rumour.
  Drill: `infra/backup/restore.sh <farm-dump.sql.gz> plaashek_restore_drill`,
  then spot-check row counts against the live farm — never restore over a live
  database.
- Document actual recovery time honestly — shared hosting means hours, not
  minutes.
