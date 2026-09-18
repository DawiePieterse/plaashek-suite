# Water build scope

**Date:** 18 September 2026
**Status:** scope — Phase 5, §11 order 7 (one of two season-less modules)
**Reference app:** none. Like Span and Stoor, Water is new (plan §11's
reference column is `—`), so this stands in for the reuse audits Phases 2
and 3 got.

## What Water is

A meter-reading log. A farm has a handful of water points — a borehole, a
dam, an irrigation offtake — each with its own meter or gauge. Someone walks
or drives past and writes down what it reads. The office wants to see the
latest number per point and how much moved since the last visit, without
chasing a paper logbook.

Plan §6 names one table, `meter_readings`, and plan §6/§8 already settle one
thing before this scope has to: Water is named explicitly as one of the two
**season-less** modules ("Modules that are genuinely season-less (Werkswinkel,
Water) leave it null"). That is inherited, not decided here.

## What that rules in and out

| Question | Call |
|---|---|
| What is a reading of? | A farm-defined **water point** — new master data, `water_points`, the same shape as Stoor's `stock_items` (name + the farm's own unit, e.g. "m³" or a level in "m"). Plan §6 only names `meter_readings`, but every capture needs something to point at, and neither `blocks` nor `assets` fits: a borehole is not an orchard block, and it is not equipment with moving parts. A farm types the point's name once, the same way it types a block's or a stock item's. |
| What is a reading's *value*? | One number, whatever the point's own unit means — a cumulative meter total for a flow meter, or a level for a dam. The schema does not care which; the farm picks the unit when it sets the point up, the same "trust the farm's own unit" call Stoor made. Two different physical quantities (a running total vs. a level) sharing one numeric column is a deliberate simplification: modelling them differently would need the office to say up front which kind every point is, for no benefit anywhere a reading is displayed. |
| Season | **Null, always** — already decided (plan §6, §8). `meter_readings` is not in `seasonStampedTables`. |
| Location (GPS) | No. A reading is already tied to a specific point by `water_point_id`; a GPS stamp would say where the phone was, not add information a fixed point doesn't already carry. |
| Weather | No, same reasoning as Span and Stoor: not an agronomic observation. |
| Corrections | None. Append-only, same as every other capture (ADR 0006's precedent) — a misread number is followed by a correct one, not edited away. |
| **Rollup shape: running total or a delta?** | **Latest reading + delta since the previous one**, not a running sum. This is the opposite call from Stoor's on-hand total, and worth stating why: a stock quantity accumulates (every move changes what's left), but a meter reading *is* the state — the second reading does not add to the first, it replaces it as "current," and what the office actually wants to know between two visits is *how much moved*, i.e. the difference. `GET /eienaar/water` returns the latest value per point and the delta against the reading before it. |
| A reading lower than the previous one (meter replaced, dam refilled oddly, a typo) | Never rejected or flagged as an error — the phone still saves it (plan §8: never block a capture over what looks wrong) and the delta is reported as negative, exactly as read. The office sees the drop and knows its own farm; software second-guessing a real number is worse than showing it plainly. |
| Reading frequency / reminders | Out of v1. No schedule, no "this point is overdue" nudge — the farm decides how often to walk the round, the same way Stoor has no reorder alert. |

## Build scope

1. **Schema** (`packages/schema/src/tables/water.ts`):
   - `water_points`: `farm_id`, `name`, `unit` (free text), `active`
     (default true — a decommissioned borehole keeps its history). Same
     shape as `stock_items`.
   - `meter_readings`: `workspaceRowColumns` (with `season_id` always null,
     per the season-less rule) plus `water_point_id` (FK), `reading`
     (numeric), `note` (nullable). Append-only, registered in
     `captureTables` but deliberately **not** in `seasonStampedTables` — the
     office's "captures without a season" count would otherwise report a
     permanent, meaningless backlog for a module that never gets one (plan
     §6 makes the same call for Werkswinkel).
2. **Field screen** (`apps/field/src/Water.tsx`): a point picker (cached
   like blocks), a numeric reading field, an optional note. No block, no
   GPS, no weather.
3. **`/sync/upload`**: one more entry in the per-entity module map
   (`meter_readings` → `water`), idempotent insert by client uuid,
   held-writes on a suspended or cancelled licence.
4. **Office** (`services/api/src/routes/water.ts`, same shape as Stoor's
   `stock.ts`):
   - `GET`/`POST`/`PATCH /water-points` — the catalog, staff-gated, create
     and edit admin-only.
   - `GET /water-catalog` — device-ticket-gated, active points only, for
     the phone's offline cache.
   - `GET /eienaar/water` — latest reading and the delta since the one
     before it, per point.
   - `GET /export/water.csv` — raw readings, one row each.
5. **Farm Admin Tool**: a `Water.tsx` panel (catalog add/edit, admin-only —
   same visibility as Stoor's) plus a shared `WaterRollup` panel visible in
   both office tools, plus the export button.
6. `water` added to `MODULE_TABS` (plan §11's order).

## Deliberately not in this scope

- **Alerts or thresholds** ("level below X", "no reading in 14 days"). A
  read-time rollup, not a monitoring system.
- **Automated/IoT meter integration.** Someone still walks the round and
  types the number.
- **Cost or billing per kilolitre.** Water answers "how much moved," never
  "what did it cost" — the same wall Stoor draws around costing.
- **Aggregating several points into one farm-wide total.** Points can measure
  different things in different units; summing them would not mean anything.
