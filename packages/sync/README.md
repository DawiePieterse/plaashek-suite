# @plaashek/sync

See [ADR 0002](../../docs/decisions/0002-sync-engine.md) before changing
anything in here — the short version: PowerSync owns the local SQLite store,
the CRUD queue (our outbox), and cursor pull. This package is the glue and
the parts PowerSync deliberately doesn't do:

- `connector.ts` — a `PowerSyncBackendConnector` that fetches this device's
  ticket-backed JWT and drains the CRUD queue to services/api's upload
  endpoint. Doesn't sign tokens (that's `@plaashek/tickets`) and doesn't
  decide conflicts (that's `conflict.ts`, run server-side).
- `conflict.ts` — last-write-wins for scalar tables, append-only for event
  tables (crates, treatments, punches, notes — plan §7). Pure functions,
  called from services/api's upload handler, not from the client.
- `types.ts` — the `WorkspaceRow` stamp every workspace row carries
  (plan §6, `docs/seasons-and-stamping.md`) and the `OutboxOp` shape sent
  over the wire.

**Interim, until the PowerSync service is running:** `apps/field` keeps its own
localStorage outbox (`src/queue.ts`) and posts to `POST /sync/upload`. Same
shape — queue locally, flush on signal, drop only what the server accepted — so
the swap to `createPlaashekConnector` is a transport change. The server half
(ticket auth, device floor, licence hold, attribution) is already the real one.

Not in here yet, and deliberately not invented ahead of need:

- Sync Rules (PowerSync Service config, per `farm_id` / `module_code`,
  filtered by JWT claims) — first written against `veldnotas`, the first
  module in build order (plan §11).
- A registry of which real tables are `scalar` vs `event` — waits for
  `veldnotas`'s and `boord`'s actual schema in `packages/schema`.
