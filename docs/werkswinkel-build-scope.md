# Werkswinkel build scope

**Date:** 18 September 2026
**Status:** scope — Phase 5, built ahead of `stoor` ([ADR 0014](decisions/0014-water-werkswinkel-before-stoor.md))
**Reference app:** none. Same shape as [span-build-scope.md](span-build-scope.md)
and [water-build-scope.md](water-build-scope.md).

## What Werkswinkel is

The workshop's two paper registers: what went into the tank, and what is
broken. Plan §6 names both tables — `work_orders`, `fuel_logs` — under one
module code, `werkswinkel` (§2.1's locked spelling fix: not "werkwinkel").
Both are season-less (§6), same as Water.

## What that rules in and out

| Question | Call |
|---|---|
| What identifies the vehicle/equipment? | The same shared `assets` table Water uses (plan §4.5: "one shared workspace"). A tractor and a borehole meter are both just an asset with a name; there is no separate "equipment" master-data table. |
| One screen or two? | One module, one field screen, with a kind switch (fuel / issue) at the top — plan §8's "one job per screen" is about not making a worker hunt through an unrelated form, not about one table per screen. Filling diesel and reporting a flat tyre are both "something happened at the workshop today," picked from two buttons before the relevant fields show. |
| Corrections | None. Append-only, same as every other capture (ADR 0006). |
| A work order's lifecycle (open → in progress → done) | Flattened to two states, `open` and `closed`, carried as one column on an append-only row — no update, no foreign key from one row to the row it closes. The office reads the sequence per asset, same principle as Span's punch pairs (docs/span-build-scope.md), simplified further: a work order does not need total elapsed time, only "is there an open one right now" — the most recent row per asset answers that. |
| Does the phone know whether an asset already has an open issue? | No — deliberately, same call as Span's "no enforcement" (docs/span-build-scope.md) and Water's "no plausible-range check." Cross-device current state would need a live fetch the phone cannot guarantee is fresh offline, so the phone never tries: "report an issue" and "mark resolved" are both always available, for any asset, and a mismatch (marking resolved something nobody reported) is visible to the office rather than silently prevented. |
| Fuel quantities | Litres, required; odometer, optional (not every asset has one — a stationary pump does not); a free-text note. No cost, no supplier, no tank-level reconciliation — that is stock-keeping, which is `stoor`'s job when it is scoped, not this module's. |

## Build scope

1. Reuses `POST /assets` / `GET /assets` built for Water (ADR 0014) — no
   second asset endpoint.
2. `fuel_logs` (new table): `workspaceRowColumns` plus `assetId` (not null),
   `litresUsed` (not null), `odometerKm` (nullable), `note` (nullable). No
   edit path.
3. `work_orders` (new table): `workspaceRowColumns` plus `assetId` (not
   null), `description` (not null), `status` (`open` / `closed`, not null).
   No edit path — a status change is a new row against the same asset.
4. Field screen (`apps/field/src/Werkswinkel.tsx`): a kind switch (fuel /
   issue), then the relevant fields. Fuel: asset, litres, odometer,
   optional note. Issue: asset, description, and a choice between
   *"Meld probleem"* (opens, `status: open`) and *"Merk klaar"* (closes,
   `status: closed`) — both always offered, per the no-enforcement call
   above. Same offline badge/flush footer as every other screen.
5. `/sync/upload`: two more entries in the per-entity module map
   (`fuel_logs` → `werkswinkel`, `work_orders` → `werkswinkel`), each
   idempotent insert by client uuid, held-writes on a suspended or
   cancelled licence — the same generalised route, its fourth and fifth
   entity since Phase 3.
6. Eienaar: `GET /eienaar/fuel` — litres per asset, all time (no season to
   filter by). `GET /eienaar/work-orders` — the currently open work orders:
   for each asset, its most recent `work_orders` row if that row's status
   is `open`.
7. Export: `GET /export/fuel.csv` and `GET /export/work-orders.csv`, both
   raw, one row per capture — the farm's own record of every fill-up and
   every reported issue, not just what is currently outstanding.

## Deliberately not in this scope

- Any notion of scheduled or preventive maintenance (service intervals,
  hour-meters, due dates). This module records what happened; a maintenance
  *plan* is a different, bigger product.
- Cost, parts, supplier, or invoice tracking on a work order. Werkswinkel
  says what broke and when it was marked fixed; what it cost is bookkeeping,
  out of scope for the same reason wages are (§2.1, ADR 0010's precedent
  for "records the fact, not the money" carried one step further).
- Fuel stock/tank-level reconciliation — that is `stoor`'s job, not this
  module's, once `stoor` is scoped.
- Matching a specific "closed" row to the specific "open" row it resolves.
  The rollup reports current state per asset (open or not), not a
  resolution-time metric — if a farm asks "how long did that take to fix,"
  that is a reason to revisit this call, not something guessed at now.
