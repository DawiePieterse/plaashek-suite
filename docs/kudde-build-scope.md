# Kudde build scope

**Date:** 21 September 2026
**Status:** scope — Phase 5, §11 order 6, re-opened by [ADR 0014](decisions/0014-kudde-bekfontein.md)
**Reference app:** the old Kudde app exists (plan §1) but is reference-only —
built against no real farm, so nothing in it is assumed correct. This scope
plays the same role Span's and Stoor's did: the reuse-audit substitute for a
module built without a trustworthy reference.

## Who Kudde is for

Bekfontein's cattle — about 100 head, moved between camps for feeding, four
bulls kept mixed in with the cows ([ADR 0014](decisions/0014-kudde-bekfontein.md)).
One farm, one herd, real numbers, not a spec written to cover every livestock
farm that might sign later.

## What Kudde is

Four things the farm needs to know about an animal over its life: **which one
is it, where is it, has it been treated, how much does it weigh.** Plan §6
already named the four tables before any farm existed to check them against
— `animals`, `movements`, `treatments`, `weights` — and Bekfontein's specifics
confirm that shape rather than replacing it.

## What Bekfontein's specifics rule in and out

| Question | Call |
|---|---|
| What identifies an animal? | A farm-typed tag number (**oormerk** — plan §8's own word), the same pattern ADR 0011 set for the worker number: Plaashek records the number already in the farm's ear, never mints one. Unique per farm, editable if mistyped, never reused for a different animal. |
| Where a move happened | Reuses the existing `camps` master data — no new location table. A movement names a `to_camp_id`; `from_camp_id` is nullable (an animal's first recorded movement, or one bought in, has no "from"). |
| **Movement granularity — one row per herd move, or one per animal?** | **One row per animal, written in a batch.** [ADR 0014](decisions/0014-kudde-bekfontein.md): the field screen moves a selected group to a camp in one action, but each animal in that group gets its own `movements` row. A hundred animals are not scanned individually to change camps, but each keeps an individual location trail — a later treatment or weight has to land on one animal in one camp, not an averaged herd position. |
| **Bulls mixed with cows — does Kudde model breeding?** | **No.** [ADR 0014](decisions/0014-kudde-bekfontein.md): a bull is an ordinary animal (`sex = bull`) whose ordinary camp movement happens to land him with the cows. No mating-group concept, no sire/dam linkage, no calving prediction. Real feature, not asked for yet — revisit as its own ADR if the farm asks. |
| Treatments | Free-text treatment type and optional dose/note (same "farm's own words, never a picklist we maintain" pattern as Stoor's `unit`) — a vaccination, a dip, a dose of antibiotic, whatever the farm calls it. Append-only: a wrong entry is followed by a correcting one (ADR 0006's precedent), never edited. |
| Weighing cadence | Not enforced. A `weights` row is just `animal_id` + `weight_kg` + when — captured whenever the farm actually weighs, the same "capture what happened, never demand a schedule" stance as `meter_readings`. |
| Weather / GPS on a Kudde capture | No. Same reasoning as Span and Stoor: a camp move, a treatment or a weighing is not an agronomic observation about a place — it is about the animal. |
| Season | **Movements, treatments and weights are season-stamped** (a farm asking "what did we treat this season" needs it), same as harvest events and stock moves. `animals` itself is master data, like `people`, and carries no season. |
| Where an animal currently is | **Derived at read time** as the camp from that animal's most recent `movements` row — never stored redundantly on `animals`. Same "nothing derived is stored" rule Span's hours and Stoor's on-hand total already follow: a late-synced movement must not leave a stale stored location behind. |
| Animal status (sold, dead, culled) | An `active` boolean on `animals`, same shape as `stock_items.active` and `people.active` — a sold or dead animal drops off the phone's picker without deleting its movement/treatment/weight history. No sale price, no cause-of-death field: that is record-keeping the farm has not asked for. |
| Corrections | None. Append-only for every event table, same as every other module (ADR 0006's precedent, restated in plan §7's list). |

## Build scope

1. **Schema** (`packages/schema/src/tables/kudde.ts`):
   - `animals` (master data, alongside `blocks`/`camps`/`assets`/`people`):
     `farm_id`, `tag_number` (farm-typed, unique per farm — partial unique
     index the same shape as `people.worker_number`), `sex` (`cow` / `bull` /
     `calf`, free enough to grow), `breed` (nullable free text), `birth_date`
     (nullable — often an estimate on a real herd), `active` (default true).
   - `movements`: `workspaceRowColumns` plus `animal_id` (FK `animals`),
     `to_camp_id` (FK `camps`, not null), `from_camp_id` (nullable FK
     `camps`). Append-only, registered in `captureTables` and
     `seasonStampedTables`.
   - `treatments`: `workspaceRowColumns` plus `animal_id` (FK `animals`),
     `treatment_type` (free text), `dose` (nullable free text), `note`
     (nullable). Append-only, registered the same way.
   - `weights`: `workspaceRowColumns` plus `animal_id` (FK `animals`),
     `weight_kg` (positive). Append-only, registered the same way.
2. **Field screen(s)** (`apps/field/src/Kudde.tsx`): an animal picker backed
   by tag number (cached offline like the block/item pickers already are),
   and three capture modes — move a selected group to a camp (writes one
   `movements` row per animal picked), record a treatment on one animal,
   record a weight on one animal. Offline badge and flush footer reused
   unchanged from every other field screen.
3. **`/sync/upload`**: three more entries in the per-entity module map
   (`movements`, `treatments`, `weights` → `kudde`), idempotent insert by
   client uuid, held-writes on a suspended or cancelled licence — the same
   generalised route every module since Phase 3 has plugged into. A batch
   camp move syncs as N ordinary rows, no special-cased "bulk" path.
4. **Office** (`services/api/src/routes/kudde.ts`, new file, same shape as
   `stock.ts`):
   - `GET /animals` / `POST /animals` / `PATCH /animals/:id` — the register,
     staff-gated, create and edit (tag number, sex, breed, birth date,
     active) admin-only, same pattern as the piece-work worker register and
     Stoor's catalog.
   - `GET /animal-catalog` — device-ticket-gated, active animals only, for
     the phone's offline picker (same role as `/blocks` and `/stock-catalog`).
   - `GET /eienaar/kudde` — headcount per camp (derived from each animal's
     latest movement, see the table above), plus per-animal treatment and
     weight history for the active season, staff-auth-gated like every
     other rollup.
   - `GET /export/animals.csv`, `/export/movements.csv`,
     `/export/treatments.csv`, `/export/weights.csv` alongside the other
     exports.
5. **Farm Admin Tool**: a `Kudde.tsx` panel (animal register add/edit,
   admin-only — same visibility as `Piecework.tsx`, `Stoor.tsx` and
   `MasterData.tsx`) plus a shared `KuddeRollup` panel (`@plaashek/ui-office`,
   visible to both office tools like `HarvestRollup`/`StockRollup`) and the
   four CSV export buttons.
6. `kudde` added to `MODULE_TABS` (plan §11's order — position 6, after
   `werkswinkel`).

## Deliberately not in this scope

- **Breeding, mating groups, sire/dam linkage, calving prediction.** [ADR
  0014](decisions/0014-kudde-bekfontein.md): a bull mixed with cows is an
  ordinary movement, nothing more. A real feature, worth its own ADR the day
  the farm asks for it — do not stretch `movements` or `animals` to imply it
  now.
- **Weighing schedules, growth-curve tracking, or any alert derived from a
  weight trend.** `weights` is a plain capture, same as `meter_readings`;
  nothing is computed or flagged automatically.
- **Treatment schedules, dosing compliance, or withholding periods.** Same
  wall Stoor drew around chemical-application compliance fields — a
  `treatment_type` and a `dose` are free text the farm defines, not a
  regulated record.
- **Photos or a tag scanner.** Tag number is typed or picked from the cached
  list, the same as a stock item — no camera/QR path for animals in this
  scope. Revisit if 100 head on a picker list proves too slow in the field.
- **Sale price, cause of death, or any financial figure on an animal.** Same
  boundary Stoor and Span both hold: Kudde says what happened to the animal,
  never what it is worth.
