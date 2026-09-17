# Boord + Eienaar reuse audit

**Date:** 17 September 2026
**Status:** audit — kicks off Phase 3 (plan §15 point 4)
**Reference apps:** `../Boord` (field harvest + pack house, FastAPI + SQLModel
backend, vanilla-JS PWA frontends for field/pack-house/admin) and
`../BoordOwner` (separate service, reads Boord's database read-only, adds
historical import + risk/weather analysis for the farm owner) — both sibling
repos, not this monorepo.

Boord is a much bigger app than BoordNotes was: field harvest capture is one
slice of a harvest → transport → pack-house-receiving → wage-payment system.
Plan §12's Phase 3 exit bar is narrow — "Field harvest capture. Owner sees it
after sync" — so most of this audit is about what to leave behind, not what
to port.

## Straight reuse

| Feature | Reference shape | Verdict |
|---|---|---|
| Weather stamp | `weather.py`: Open-Meteo, same WMO-code table, 600s cache, silent failure. `routers/sync.py`: stamped once per record on first insert only, never re-stamped on a retry. | Already built. `services/api/src/routes/weather.ts` and `apps/field/src/Notes.tsx`'s `raceWeather` are the same shape — reuse both verbatim for harvest capture, no new work. |
| GPS-adjacent: none needed | Boord doesn't capture per-crate GPS — the farm's fixed coordinates (Settings) drive weather instead. | Matches Plaashek's model where GPS is opportunistic. Harvest capture doesn't need it — see Block picker below. |
| Block as the organising unit | `Block.id` free-text label, every `HarvestRecord` and the whole admin Dashboard group by it. | Plaashek's `blocks` table (`packages/schema/src/tables/master-data.ts`) already exists as a real FK, seeded per farm. Reuse directly. |
| Idempotent upsert by client uuid | `session.merge(record)` keyed on `uuid`, safe to retry a batch after regaining signal. | Same pattern `sync.ts`'s `onConflictDoNothing` already uses for notes — port the reasoning, the mechanism already exists. |
| Correction model | `edited_at`/`edited_by` — an admin can patch `worker_id`/`weight_kg`/`deduction_kg` after the fact, and the sync route protects that edit from being overwritten by the device replaying its old payload. | **Do not port.** This exists in the reference solely to keep wages accurate after a mis-scan — see "No worker/wage attribution" below. Plan §7 names crates explicitly ("append-only for events (crates, treatments, punches, notes)"), and ADR 0006 already closed this exact question for notes. No new ADR needed: no edit endpoint, a correction is a new capture. |

## Does not fit — not portable, not a deferral

| Feature | Reference shape | Why it doesn't fit |
|---|---|---|
| Supplier (multi-grower pack house) | A pack house receives fruit from several farms' `Supplier` rows, tracked separately through every table (lots, billing, dashboard). | Plaashek is one farm per install with no cross-farm data (plan §6: "No cross-farm foreign keys. Ever."). There is no "pack house serving multiple growers" concept in this architecture — this isn't a Phase 3-vs-later question, it's a different business model. Skip entirely. |
| BoordOwner's architecture (reads Boord's live DB) | A separate FastAPI service connects read-only to Boord's own SQLite file. | Plaashek's office tools read the farm's own synced Postgres rows, not another app's live database. Nothing here is portable as code — `eienaar` gets rebuilt on Plaashek's schema, per README ("reuse a screen or a data shape... otherwise rebuild"). |

## Conflicts with what's locked in

- **Per-crate worker/team attribution** — the reference app stamps every
  crate with `worker_id`, chosen mid-shift on a field tablet shared by a
  whole picking team; Plaashek's locked model stamps every capture with the
  device's assigned person and rules out an in-app person picker (§2.1).
  Closed — [ADR 0007](decisions/0007-boord-no-worker-attribution.md): no
  per-crate attribution, `harvest_events` gets `created_by` the same way
  every other module does.

## Needs a product call before building

| Feature | Reference shape | Question |
|---|---|---|
| **Lots / dispatch / pack-house receiving** | `Lot`, `ReceivingRecord`, `PrePackRecord` — a field device bundles crates into a picking slip, dispatches it, and a separate receiving station logs discrepancies and condition. | Boord is Field-only in the module table (plan §4.5) — there's no pack-house-receiving module or device role anywhere in §11's order. Recommend: **out of Phase 3 scope.** A crate is captured and synced; what happens to it after the truck leaves the block isn't part of "field harvest capture." Revisit only if a future module (`stoor`?) actually asks for it. |
| **Wages/payments** (`RateSetting`, `Payment`, admin Dashboard's wage columns) | Rate-per-kg or per-crate-tier, calculated and snapshotted per pay period. | Explicit non-goal (§2.1: "No payments inside Plaashek Management in year one"). Recommend: **defer**, same call the plan already made. |
| **Dashboard / Eienaar's first screen** | Boord's admin Dashboard: active teams/workers/blocks, per-worker crate counts, wage totals. BoordOwner's version is the same thing with wages stripped. | Plan §4.3: "While only Boord is live, `eienaar` is Boord figures in owner form." Read literally, that's a minimal read-only rollup, not the reference's full historical-import + weather-risk analysis screens. Recommend: **Phase 3 `eienaar` = totals only** — crates and kg captured, by block, for the active season, read straight off Plaashek's own `harvest_events` (no cross-service DB read, no wage column since there's nothing to strip). Historical import and risk analysis: defer, first candidate once a farm asks for season-over-season comparison. |

## Recommended Phase 3 build scope

Matches the plan's actual exit bar ("field harvest capture; owner sees it
after sync") rather than reference-app parity:

1. `harvest_events` table (new — plan §6 only lists the name so far):
   `workspaceRowColumns` (same as `notes`) plus `block_id` (FK to `blocks`),
   `weight_kg` (not null), `deduction_kg` (nullable, defaults to none
   deducted), `weather_temp`, `weather_humidity`, `weather_condition`.
   Append-only — no `edited_at`/`edited_by`, no update path, same as `notes`.
2. Field capture screen: block picker (keep it here — unlike veldnotas,
   Boord's own reference treats block as the fundamental unit of a picking
   day, and GPS accuracy can't reliably separate adjacent rows/blocks the way
   it can place a free-text note), a weight input, an optional deduction
   input. Weather and offline-badge/poll: literally the same code the
   veldnotas screen already has — port `raceWeather` and the flush effect
   as-is.
3. `sync.ts`-equivalent upload route for `harvest_events`, same shape as
   `notes`'s: idempotent insert by client uuid, held-writes on a
   suspended/cancelled licence, no update branch.
4. `eienaar` first screen: total crates + kg for the active season, grouped
   by block. Read-only, staff-auth-gated the same way `/farm` already is.
5. Not in this phase: worker/team attribution (closed — [ADR 0007](decisions/0007-boord-no-worker-attribution.md),
   revisit only if a farm asks for per-picker counts without payroll
   attached), lots/dispatch/receiving, wages, dashboard history/risk
   analysis.

**Scheduling reminder (plan §12):** do not run Phase 3 across the pilot
farm's actual pick — map this against Laughing Waters / Bekfontein's season
before starting, not after.
