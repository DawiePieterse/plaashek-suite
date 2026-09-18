# Werkswinkel build scope

**Date:** 18 September 2026
**Status:** scope — Phase 5, §11 order 7 (one of two season-less modules)
**Reference app:** none — new, like Span, Stoor and Water.

## What Werkswinkel is

The workshop's own record: what is wrong with a piece of equipment, whether
it has been fixed, and how much fuel went into what. Plan §6 names two
tables, `work_orders` and `fuel_logs`, and plan §6/§8 already settle that
Werkswinkel is **season-less**, the same as Water — inherited, not decided
here.

## A gap this scope runs into before it can start

Both tables need something to point at — the tractor, the bakkie, the pump —
and plan §6 already names that table: `assets`. It exists in the schema and
the demo seed inserts two rows into it directly (`Trekker`, `Pakhuis`), but
**nothing else touches it**: there is no `POST /assets`, no `GET` that lists
it for an office picker, and it is not in `FarmContext`. People, blocks and
camps all got this same treatment in Phase 4 (plan §12) before Boord or Span
could reference them meaningfully; assets never has. Werkswinkel's first
build step is closing that gap — add-only, same shape as
`POST /people` / `POST /blocks`, plus a card in `MasterData.tsx` and an
`assets` field on `FarmContext` — not a new decision, just the one Phase 4
made for every other kind of master data, applied to the kind that got
skipped.

## What that rules in and out

| Question | Call |
|---|---|
| What is a work order about? | One `asset` (a specific tractor, pump, bakkie — not "the workshop" in general). No asset picker with a text fallback: if it isn't in the list, the farm has not typed it in yet, the same rule Boord's block picker and Stoor's item picker already follow. |
| **A work order has a lifecycle (open, then fixed) — how does that fit an append-only suite?** | **Two append-only events, paired at read time — Span's shape, not a status column edited in place.** Opening a job writes one row (`event: "opened"`, a description of what's wrong); closing it writes a second row against the same asset (`event: "closed"`, an optional note on what was done). Nothing is ever updated — the same "a correction is a new capture" rule (ADR 0006) applied to a job's lifecycle instead of to a single reading. `GET /eienaar/werkswinkel` pairs each `opened` with the next `closed` for that asset, exactly the way `lib/attendance.ts` pairs punches; an unpaired `opened` is an **open job**, reported as such rather than guessed at. |
| Who can close a job that someone else opened? | Anyone with the module on their phone. A device is assigned to one person (plan §3.2), but nothing here ties a *job* to the person who opened it — a mechanic often finishes a job a driver logged. This needs the phone to read back **open jobs for an asset**, not just trust its own last local state the way Span trusts its own last punch: `GET /work-orders/open` (device-ticket-gated) lists what is still open, so a different phone can close one. |
| Fuel logs | A plain append-only capture, one row per fill-up: `asset_id`, `litres`, an optional odometer/hour-meter reading (useful for consumption later, never required), an optional note. No lifecycle, no pairing — closer in shape to a single-direction Stoor move than to a work order. |
| Season | Null, always (plan §6, §8) — neither table joins `seasonStampedTables`. |
| Location / weather | No, same reasoning as Span, Stoor and Water: a workshop job or a fuel fill-up is not tied to a place worth stamping or an agronomic observation. |
| Corrections | None on either table — append-only throughout. |
| **Rollup shape** | Work orders: **open jobs per asset**, paired at read time (same shape as Span's attendance rollup — nothing totalled is stored). Fuel: raw log, exported and left to the office to total however it needs — no derived "litres this month" screen in v1, the same restraint Span's CSV shows for hours (§10's export gives the farm its own data rather than deciding the one number they want from it). |
| Overdue-maintenance schedules, service intervals, parts/cost tracking | Out of v1 — a real feature, not a column. Werkswinkel says *what* happened to an asset and *when*; it does not plan the next service or price the job. |

## Build scope

1. **Close the assets gap** (see above): `POST /assets` (add-only, same
   pattern as `/people`/`/blocks`), assets included in `GET /farm`'s
   response and `FarmContext`, an "Bates" ("Bates/Toerusting") card in
   `MasterData.tsx`.
2. **Schema** (`packages/schema/src/tables/werkswinkel.ts`):
   - `work_orders`: `workspaceRowColumns` (season always null) plus
     `asset_id` (FK), `event` (`opened` / `closed`), `description`
     (nullable — the fault on open, what was done on close).
   - `fuel_logs`: `workspaceRowColumns` (season always null) plus
     `asset_id` (FK), `litres` (positive), `meter_reading` (nullable),
     `note` (nullable). Both registered in `captureTables`, neither in
     `seasonStampedTables`.
3. **Field screen** (`apps/field/src/Werkswinkel.tsx`): an asset picker
   (cached like blocks/water points), then a choice — log fuel, open a new
   job, or close one of this asset's open jobs (fetched from
   `GET /work-orders/open`, offline-safe the same way Stoor's card list is:
   an asset added or a job opened since the last cache refresh still saves,
   resolved at sync). Three small forms behind one asset picker rather than
   three separate screens, since they share the same first question.
4. **`/sync/upload`**: two more entries in the per-entity module map
   (`work_orders` → `werkswinkel`, `fuel_logs` → `werkswinkel`), both
   idempotent by client uuid, both held on a suspended/cancelled licence.
5. **Office** (`services/api/src/routes/werkswinkel.ts`):
   - `GET /work-orders/open` — device-ticket-gated (the phone's own read,
     to close a job someone else opened) and staff-gated (the office's own
     view of what is still open).
   - `GET /eienaar/werkswinkel` — open jobs per asset, closed-job history
     left to the export rather than a second rollup.
   - `GET /export/work-orders.csv` and `GET /export/fuel.csv` — raw, one
     row per event/fill-up.
6. **Farm Admin Tool**: shared `WorkOrderRollup` panel (open jobs, visible
   in both office tools) plus the two export buttons. No admin-only setup
   screen the way Stoor's catalog needs one — an asset is the only thing to
   define up front, and that is step 1 above, in `MasterData.tsx`.
7. `werkswinkel` added to `MODULE_TABS`.

## Deliberately not in this scope

- **Service schedules, overdue alerts, parts and cost tracking.** A real
  maintenance-planning feature, not this module's job.
- **A "who did the work" attribution beyond the assigned device.** Same
  wall as everywhere else in the suite (§2.1) — no in-app person picker;
  whoever's phone logs the close is whoever the office assigned that device
  to.
- **A derived fuel-consumption number** (litres per hour, per hectare). The
  raw log and the optional meter reading are exported; doing the arithmetic
  is left to the office until a farm actually asks for it.
