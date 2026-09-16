# Backup

- Nightly Postgres dump, off the app server, retained 30 days.
- Media bucket versioned.
- **Restore tested quarterly.** Diarise it. An untested backup is a rumour.
- Document actual recovery time honestly — one VPS means hours, not minutes.
