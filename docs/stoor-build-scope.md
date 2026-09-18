# Stoor build scope

**Date:** 18 September 2026
**Status:** scope — Phase 5, §11 order 5 (plan §12: *"`stoor` — next, not started"*)
**Reference app:** none. Like Span, Stoor is new (plan §11's reference column
is `—`), so this stands in for the reuse audits Phases 2 and 3 got.

## What Stoor is

A stock ledger. The farm's store holds chemicals, fertiliser, fuel, spares —
things that come in and get used up. The office needs to know what is on the
shelf without walking out to count it, and where the good stuff actually went.

Plan §10 flags this module as carrying more weight than anything shipped so
far: *"Stoor — chemical and stock records with legal weight."* Two shapes
were on the table for that — a general stock ledger, or a stricter
chemical-application record (batch numbers, withholding periods, the kind of
thing an export audit asks for). The farm asked for the general ledger: a
catalog of items with a quantity on hand, and captures for stock received and
stock used, optionally tied to a block. Chemical-application-specific
compliance fields (batch/lot, withholding period, target pest) are
deliberately out — if a farm needs that later it is its own scope, not a
column bolted onto this one.

## What that rules in and out

| Question | Call |
|---|---|
| What is tracked? | A farm-defined catalog (`stock_items`: name + the farm's own unit — "L", "kg", "bag", whatever they already use) and a move on each item, `in` or `out`. |
| Where a move happened | Optional block, shown only on an `out` move — receiving stock has no block, using it sometimes does ("20 L glyphosate used on Block C"). Never required: plan §8 never blocks a capture over a field the worker cannot answer. |
| Weather | No. Same reasoning as Span: a stock move is not an agronomic observation. |
| Location (GPS) | No, for the same reason a punch has no weather — this happens at the store, not somewhere the coordinates say anything useful. Every other field screen stamps a GPS fix because *where the work happened* is the point; here it is not. |
| Season | Stamped, like every other capture — a farm asking "what did we spray this season" needs it. |
| **Stock on hand — season-scoped or running total?** | **Running total, all-time.** This is the one place Stoor breaks from Harvest's and Span's pattern on purpose: a crate count or a clocked hour is naturally a per-season question, but a shed does not empty itself at a season boundary. `GET /eienaar/stock` sums every move ever made, not just the active season's. |
| Corrections | None. Append-only, same as every other capture (ADR 0006's precedent) — a miscounted move is followed by a correcting one, and the office reads the ledger, not an edit history. |
| Catalog management | Add-only pattern, same shape as people/blocks/camps (`docs`, plan §12 Phase 4) plus one thing they do not have: `active`, so an item nobody stocks any more drops off the phone's picker without deleting the moves already logged against it — the same reasoning ADR 0011 used for a worker who has left. |
| Negative stock | Allowed, not flagged. The ledger reports what the app was told; if the farm's real shelf and Stoor disagree, that is a stock-take conversation for the farm, not something the software should guess a correction for. |
| Stock-takes / reconciliation | Out of this scope. A running total from captured moves is what §11 asks for; a proper stock-take (count on a date, adjust to match) is a different feature with its own UI, worth building once a farm actually asks. |
| Chemical-specific compliance fields (batch/lot, withholding period, target pest/disease) | Out — see "What Stoor is" above. `stock_items`/`stock_moves` carry nothing this general ledger does not need. |

## Build scope

1. **Schema** (`packages/schema/src/tables/stock.ts`):
   - `stock_items`: `farm_id`, `name`, `unit` (free text, never enforced —
     whatever the office already calls it), `active` (default true, so a
     retired item keeps its history rather than being deleted).
   - `stock_moves`: `workspaceRowColumns` plus `item_id` (FK), `direction`
     (`in` / `out`), `quantity` (positive), `block_id` (nullable FK, `out`
     only in practice, never enforced), `note` (nullable free text — a
     supplier on receipt, a reason on use). Append-only, registered in
     `captureTables` and `seasonStampedTables` alongside notes, harvest
     events and punches.
2. **Field screen** (`apps/field/src/Stoor.tsx`): item picker (cached the
   same way blocks are, so it resolves offline), a direction toggle
   (*Ontvang* / *Gebruik* — received / used), a quantity field, an optional
   block picker shown only for a `used` move, and an optional note. Offline
   badge and flush footer reused unchanged from the other screens.
3. **`/sync/upload`**: one more entry in the per-entity module map
   (`stock_moves` → `stoor`), idempotent insert by client uuid, held-writes
   on a suspended or cancelled licence — the same generalised route every
   module since Phase 3 has plugged into.
4. **Office** (`services/api/src/routes/stock.ts`, new file — the same shape
   as `piecework.ts`: a register, a phone-facing catalog fetch, and a rollup):
   - `GET /stock-items` / `POST /stock-items` / `PATCH /stock-items/:id` —
     the catalog, staff-gated, create and edit (name, unit, active) admin-only,
     same pattern as the piece-work worker register.
   - `GET /stock-catalog` — device-ticket-gated, active items only, for the
     phone's offline-safe cache (same role as `/blocks` and `/pickers`).
   - `GET /eienaar/stock` — quantity on hand per item, all-time (see the
     table above), derived at read time like every other rollup in this
     suite: nothing totalled is stored.
   - `GET /export/stock.csv` — raw moves, one row per move, the same "give
     the farm its own data and let them pair it however they need"
     philosophy as `/export/attendance.csv`.
5. **Farm Admin Tool**: a `Stoor.tsx` panel (catalog add/edit, admin-only —
   same visibility as `Piecework.tsx` and `MasterData.tsx`, which the Owner
   Module does not render either) plus the shared `StockRollup` panel (in
   `@plaashek/ui-office`, visible to both tools like `HarvestRollup` and
   `AttendanceRollup`) and the CSV export button.
6. `stoor` added to `MODULE_TABS` (plan §11's order — after `span`).

## Deliberately not in this scope

- **Stock-takes and reconciliation.** A running total derived from captured
  moves, not an audited count. See the table above.
- **Purchase orders, suppliers as their own entity, reorder points/alerts.**
  A `note` field covers "who it came from" in free text; a proper supplier
  record and reorder thresholds are a real feature, not a column.
- **Chemical-application compliance records** (batch/lot numbers, target
  pest/disease, withholding periods). A different, stricter scope — see
  "What Stoor is."
- **Costing.** No rand value on an item or a move. Stoor answers "how much is
  on the shelf," not "what is it worth" — the same wall ADR 0010 drew around
  Span (says *when*, never *what that is worth*) applies here to *what*,
  never *what it cost*.
