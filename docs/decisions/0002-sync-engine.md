# ADR 0002 — Sync engine: build or buy

**Date:** 16 September 2026
**Status:** accepted

## Question

Plan §9 flags offline sync with conflict handling as the hardest thing in this
plan, and asks for a deliberate build-vs-buy call rather than defaulting to
build. §12's sizing warning names this as the line item most likely to blow
the Phase 1 estimate. §13 Q6.

## Decision

Buy: **PowerSync**, self-hosted (Open Edition) against our own Postgres in
`af-south-1`, not a from-scratch outbox/cursor/local-SQLite engine.

This also closes §13 Q2 (Dexie vs SQLite/OPFS) in SQLite's favour from day
one — PowerSync's web client runs SQLite via WASM over OPFS, so there is no
Dexie phase to migrate away from later.

## Why

Matched against what the plan actually needs:

- **Local store** — PowerSync's client SDK embeds SQLite (OPFS-backed in the
  browser). Removes the Dexie-first, SQLite-later path plan §9 left open.
- **Outbox (§7)** — PowerSync's client-side CRUD queue *is* the outbox. We
  write the upload endpoint that drains it into Postgres; we do not write the
  queue, its persistence, or its replay-on-reconnect logic.
- **Cursor pull per device/module (§7)** — handled by PowerSync bucket sync,
  driven by Sync Rules keyed on JWT claims.
- **Tickets (§3.4, §9)** — PowerSync authenticates over signed JWTs (JWKS
  verified) with custom claims usable in Sync Rules parameter queries. Our
  ticket shape — `farm_id` + `device_id` + scanned `module_code`s — becomes
  the JWT payload, and floor/ceiling licensing (§3.3) becomes a Sync Rules
  filter over those claims. We still mint and sign these tokens ourselves
  (`@plaashek/tickets`); PowerSync only verifies them.
- **ZA hosting (§9)** — Open Edition self-hosts next to our own Postgres in
  `af-south-1`. No data leaves the region because of this choice.

What buying does **not** remove — still ours regardless:

- Conflict logic itself (LWW on scalars, append-only on event tables — crates,
  treatments, punches, notes). PowerSync delivers the queued writes in order;
  deciding how to apply them against existing rows is our upload-handler code
  either way.
- Revoke (§3.5) — needs our own short-TTL JWT reissuance plus a
  revoked-device check feeding Sync Rules. PowerSync has no concept of this.
- The separate lazy photo/voice channel (§7) — PowerSync syncs relational
  data, not blobs.
- QR pairing, entitlements, the two admin apps, `eienaar` — untouched by this
  choice.

Net effect: removes the single hardest item in §12's sizing warning without
touching the parts of Phase 1 that are ours no matter which way this went.

## Consequences

- The PowerSync Service is source-available under the FSL, not fully
  open-source. Fine for running our own product; would matter if we ever
  wanted to offer a competing sync-as-a-service product, which we don't.
  Noted here so it is a documented tradeoff, not a surprise later.
- `packages/sync` becomes: the `PowerSyncBackendConnector` implementation
  (credential fetch + upload), the shared `WorkspaceRow` / outbox-op types,
  and the conflict-resolution functions the upload handler calls — not a
  from-scratch sync protocol.
- Sync Rules (bucket definitions per `farm_id` / `module_code`, filtered by
  JWT claims) live as server-side PowerSync Service config, alongside
  `services/api`. Not yet written — first real module (`veldnotas`, plan
  §11) is what will shape the first Sync Rules file.
- If this is reversed later: the CRUD-queue shape and JWT claim shape are
  ordinary enough (op, entity, entity_id, payload; farm_id, device_id,
  modules) that a hand-rolled outbox could read the same upload endpoint
  contract. The conflict-resolution functions in `packages/sync` do not
  depend on PowerSync and would carry over unchanged.

## Reference

- PowerSync self-hosting: https://docs.powersync.com/intro/self-hosting
- PowerSync custom JWT auth: https://docs.powersync.com/configuration/auth/custom
- PowerSync Sync Rules parameter queries: https://docs.powersync.com/sync/rules/parameter-queries
