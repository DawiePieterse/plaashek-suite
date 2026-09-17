# Backup

- Nightly Postgres dump, off the app server, retained 30 days — `pnpm backup` (`backup.sh`), cron it on the VPS once one exists.
- Media bucket versioned.
- **Restore tested quarterly.** Diarise it. An untested backup is a rumour.
  Drill: `RESTORE_DATABASE_URL=<throwaway db> pnpm restore <dump-file>`, then
  spot-check row counts — never point it at the live database.
- Document actual recovery time honestly — one VPS means hours, not minutes.
