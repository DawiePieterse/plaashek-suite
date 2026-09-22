# Deploying to a private demo server (Apple Silicon Mac)

Scripts in `infra/deploy/mac/`. Everything runs natively — no Docker, no
domain/DNS required. The API and each PWA are served over the Mac's LAN IP,
so any phone or laptop on the same Wi-Fi can open them during a demo. This
is not a production setup (`infra/backup/README.md` assumes production is a
VPS); it's for controlled demos off a machine you control.

## One-time setup

Prerequisites: [Homebrew](https://brew.sh) installed. Everything else
(Node, Postgres, Caddy) is installed by the script.

```
git clone <this repo> && cd plaashek-suite
./infra/deploy/mac/deploy.sh
```

This installs Homebrew packages, starts Postgres, builds the API and all
four PWAs, creates the `plaashek_demo` database, runs migrations, seeds a
demo farm (**Mooiplaas**), bootstraps a Plaashek Management staff login, and
registers two launchd services so both the API and the static file server
survive a reboot:

- `com.plaashek.api` — the Fastify API (`services/api`), port 8080
- `com.plaashek.caddy` — serves the four built PWAs as static files, one
  port each

At the end it prints the URLs and the demo logins. Typical output:

```
  Plaashek Management  http://192.168.1.42:5177
  Farm Admin Tool      http://192.168.1.42:5173
  Field (phones)       http://192.168.1.42:5174
  Owner rollup         http://192.168.1.42:5175
  API                  http://192.168.1.42:8080

  Management login:  staff@plaashek.local / 3f9a1c...
  Demo farm: Mooiplaas
  Admin login:        admin@mooiplaas.test / mooi1234
  Owner login:        eienaar@mooiplaas.test / mooi1234
```

`infra/deploy/mac/status.sh` also prints the Management login on every run,
so you don't have to scroll back through `deploy.sh` output to find it
again.

Pairing a phone to the field app: open the admin tool, generate a device
pairing QR, and scan it with the phone's camera while it's on the same
Wi-Fi — the QR encodes `http://<lan-ip>:5174/pair/<token>`.

If the Mac has more than one active network interface, or the script
guesses the wrong one, override it: `LAN_IP=192.168.1.42 ./infra/deploy/mac/deploy.sh`.

The Management email defaults to `staff@plaashek.local`; override it with
`STAFF_EMAIL=you@example.com ./infra/deploy/mac/deploy.sh` (only takes
effect the first time, i.e. before `generated/staff-credentials.txt` exists).

## Redeploying after code changes

```
git pull
./infra/deploy/mac/deploy.sh
```

Safe to re-run: it reuses the existing `.env` and database, rebuilds
everything, re-runs migrations, and restarts both services. It does **not**
reseed by default (so demo data you've entered survives a redeploy). To
reset back to the clean demo farm:

```
./infra/deploy/mac/deploy.sh --seed
```

`pnpm seed` (what `--seed` runs) only ever wipes and recreates the
**Mooiplaas demo org** — it can't touch a different farm.

## Before/after a demo

```
infra/deploy/mac/status.sh   # check both services + Postgres are up
infra/deploy/mac/stop.sh     # pack away — stops the API and Caddy (Postgres stays up)
infra/deploy/mac/start.sh    # bring them back without rebuilding
```

## Where things live

- App code: builds go to each `apps/*/dist` (git-ignored) and
  `services/api/dist`.
- Secrets: `.env` at the repo root, generated once by `deploy.sh` and never
  overwritten by a redeploy. Back it up somewhere if you'd hate to
  regenerate it (regenerating just issues new session/ticket-signing
  secrets, which logs everyone out and invalidates any printed pairing
  QRs — not catastrophic, just annoying mid-demo).
- Generated, machine-specific config: `infra/deploy/mac/generated/`
  (git-ignored) — the rendered `Caddyfile`, service logs
  (`generated/logs/api.log`, `caddy.log`, plus `.error.log` variants), and
  `generated/staff-credentials.txt` (the Management login, `chmod 600`).
  Deleting that file makes the next `deploy.sh` run generate a fresh
  password and re-bootstrap the account under the same email.
- launchd job definitions:
  `~/Library/LaunchAgents/com.plaashek.{api,caddy}.plist`.

## Troubleshooting

- **A PWA loads but can't reach the API (network errors in the browser
  console).** The app was built with the API URL baked in at build time
  (`apps/*/.env.production`, `VITE_API_URL`). If the Mac's LAN IP changed
  (new Wi-Fi network, DHCP renewal), re-run `deploy.sh` — it regenerates
  those files and rebuilds.
- **`launchctl bootstrap` fails with "service already loaded".** Harmless —
  `deploy.sh` always `bootout`s first; if you see this outside the script,
  run `infra/deploy/mac/stop.sh` then `start.sh`.
- **Postgres won't start.** `brew services list` to check its state, then
  `tail -f $(brew --prefix)/var/log/postgresql@16.log`.
- **API crash-looped.** `tail -f infra/deploy/mac/generated/logs/api.error.log`.
  `KeepAlive` means launchd restarts it automatically, so a persistent crash
  shows up as the API port refusing connections in `status.sh`.
- **Need a real domain / HTTPS instead of `IP:port`.** Point DNS records at
  the Mac (or a router port-forward + dynamic DNS if it's reachable from
  outside your LAN), then replace the port-based `Caddyfile` blocks in
  `deploy.sh` with hostname-based ones — Caddy will issue Let's Encrypt
  certificates automatically once each hostname resolves to the Mac. Not
  needed for a same-Wi-Fi demo.
