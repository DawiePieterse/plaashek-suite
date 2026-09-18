# Water build scope

**Date:** 18 September 2026
**Status:** scope — Phase 5, built ahead of `stoor` ([ADR 0014](decisions/0014-water-werkswinkel-before-stoor.md))
**Reference app:** none. Same shape as [span-build-scope.md](span-build-scope.md):
this stands in for the reuse audits Phases 2 and 3 got, decided before any
code, without a reference app to mine.

## What Water is

A meter reading. A borehole, an irrigation pump, a tank — the farm has a
number of water points, each with a meter, and someone reads it and writes
the number down. Plan §6 gives it one table, `meter_readings`, and names
Water as one of the two season-less modules (with Werkswinkel) — a meter
reading is not tied to a pick.

## What that rules in and out

| Question | Call |
|---|---|
| What identifies the meter? | The farm's own `assets` master data (plan §6, §4.5) — already a shared table, already seeded with two rows (`Trekker`, `Pakhuis`) for the demo farm. A water point is an asset like any other; no new master-data table for "meters" specifically. |
| Season | None — stamped null, like every capture from this module (§6). Not counted in `seasonStampedTables`, so a farm with no active season never sees "readings without a season" for this module. |
| GPS / weather | No. Notes and Harvest stamp GPS because the capture is *about* a place the worker is standing in; a meter reading is about a fixed asset the office already knows the location of. Adding a stamp nothing reads would be scope for its own sake. |
| Corrections | None. Append-only, same precedent as every other capture (ADR 0006) — a wrong reading is followed by a right one. |
| Enforcement (rising readings, plausible ranges) | None, deliberately — same call Span made (docs/span-build-scope.md): the phone does not know the last reading with certainty (offline, multi-device), so it never second-guesses what the worker typed. A reading that looks wrong is something the office sees and asks about, not something the phone refuses. |
| What the office sees | The latest reading per asset, and who took it — not a graph, not a rate-of-use calculation. That is a real feature a farm will eventually ask for; this scope is the first reading, not a metering dashboard. |

## Build scope

1. **`assets` gets a create path.** `POST /assets` (Farm Admin Tool,
   mirrors `POST /blocks`) and `GET /assets` (field device, mirrors
   `GET /blocks`) — today `assets` only exists via the seed script.
   `stoor`, when it is scoped, reuses both.
2. `meter_readings` (new table): `workspaceRowColumns` plus `assetId` (not
   null, references `assets`), `reading` (not null), `note` (nullable free
   text — "laag, moet dalk gefiks word" is worth capturing next to a
   number). No edit path.
3. Field screen (`apps/field/src/Water.tsx`): pick an asset, type the
   reading, optional note, save. Same offline badge/flush footer as every
   other capture screen. No GPS warm-up, no weather race — see above.
4. `/sync/upload`: one more entry in the per-entity module map
   (`meter_readings` → `water`), idempotent insert by client uuid,
   held-writes on a suspended or cancelled licence — the route generalised
   for this in Phase 3 and already proved twice since (Span, piece-work).
5. Eienaar: `GET /eienaar/water` — the latest reading per asset, with who
   read it and when. Not season-gated (there is no season to gate on).
6. Export: `GET /export/water.csv` — every reading, raw, one row each, same
   shape as the other exports.

## Deliberately not in this scope

- Any notion of a target, an expected range, or a leak alert. That needs a
  history of readings to compare against, which this scope does not build
  a screen for yet.
- Metering hardware, telemetry, or anything that reads a meter without a
  person typing a number. This is a paper-replacement capture, same as
  every other module in the suite.
- A per-asset reading history screen. The eienaar rollup shows "now", not
  "over time" — revisit if a farm asks for the trend.
