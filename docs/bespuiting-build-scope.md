# Bespuiting build scope

**Date:** 21 September 2026
**Status:** scope — proposed. Not yet in plan §11's module order (currently
`veldnotas → boord → eienaar → span → stoor → kudde → water/werkswinkel →
oudit`, "fully built" per plan §12). This is a new addition on top of that
order, not a module the plan already named, so the order and priority below
are a recommendation to confirm with the farm, not a decided call.
**Reference:** no reference app — like Span, Stoor and Water, this is new.
The reference material instead is two real documents from Bekfontein: a
paper compliance book (`Blaar bespuiting vorm.xls` — Stock Inventory,
Records of Application, PPP Info, Lietsjie Bemest) and a weekly fertigation
plan (`2026 Wk 39 Cats 10-19.xlsx` — per-block dosing and a Kraan/valve
schedule).

## What Bespuiting is

A chemical-application record. Stoor already tracks what is on the shelf
and Water already tracks what moved through a meter. Neither answers the
question the farm's paper book exists for: *what got put on which block, on
what date, by whom, and when is it safe to pick again.* That question spans
both — a spray or a fertigation run is a stock item going **out**, often
with water going through a **Kraan** at the same time, against a specific
**block**, plus a handful of facts the general stock ledger and the meter
log were both deliberately built without: active ingredient, concentration,
operator, and a withholding period that turns into a safe-harvest date.

Stoor's own build scope named this and ruled it out on purpose: *"a
stricter chemical-application record (batch numbers, withholding periods,
the kind of thing an export audit asks for)... deliberately out — if a farm
needs that later it is its own scope, not a column bolted onto this one."*
Bekfontein's paper book is that farm asking. This doc is that scope.

## What that rules in and out

| Question | Call |
|---|---|
| Is this a new stock ledger, competing with Stoor? | No. Bespuiting does not duplicate `stock_items`/`stock_moves` — it **references** them. Picking a product on the application screen is the same catalog Stoor's field screen uses; saving the application also books a `stock_moves` `out` row so Stoor's on-hand total and `/export/stock.csv` stay correct without the farm entering the same use twice. Bespuiting owns nothing about *quantity on hand* — Stoor still does. |
| Where do active ingredient, L-number, and withholding period live? | Not on `stock_items` — Stoor's scope explicitly keeps that table free of compliance fields, and most stock items (fuel, spares, fertiliser bags) will never have them. A new table, `product_registrations` (one row per `stock_items.id` that needs it, nullable everywhere else), holds them. Filling it in is optional per item; an item with no registration can still be used on an application, it just has no PHI to compute a safe-harvest date from. |
| Does an application always involve water? | No. A foliar pesticide spray (PPP Info's usual case) is a stock-out with no meter reading. A fertigation run (`Lietsjie Bemest`, the Wk 39 sheet) is a stock-out **and** a `meter_readings` row on the Kraan it ran through. The water link is optional on the capture, same as Stoor's block link is optional on a `used` move. |
| Is a block required? | Yes — unlike Stoor's `used` move, where the block is optional because not every stock-out happens in a block. Every row in the paper book names a block; this module exists specifically to answer "what happened in which block," so leaving it out defeats the point. |
| Weather and GPS? | Yes to both — the one place this diverges from Stoor and Water, and deliberately: those modules explicitly said no because a stock move happens at the store and a meter reading is tied to a fixed point already. A spray happens in the orchard, and wind/temperature at the time is exactly what a spray-drift compliance record needs to show. Same capture as Veldnotas: GPS stamp, `/weather/current` at save time. |
| Season | Stamped. "What did we spray this season, and when can we pick it" is a season question the same way Stoor's rationale (despite being a running-total module) already conceded stock is. |
| Safe-harvest date | **Computed at read time**, never stored — application date + the product's withholding period from `product_registrations`, the same "nothing totalled is stored" rule Stoor's and Water's rollups already follow. A withholding period recorded as "None" or "None - Not on Fruit" (PPP Info has both) computes no date; the office reads the raw value either way. |
| Reason for application | Free text, prefilled from the product's registration (PPP Info carries a default reason per product, e.g. "(Spray on trees) Flush control") but editable per capture — the same reasoning let Water accept a lower reading than the last one without a fight: the farm's own words win over a stored default. |
| Corrections | None. Append-only, same as every other capture (ADR 0006). A wrong entry is followed by a correcting one. |
| The weekly fertigation **plan** (which Kraan runs which day, planned dosing) | Out of this scope. Stoor and Water both already ruled out schedules and reminders ("the farm decides how often," no "overdue" nudge); this module captures what actually happened, not what was planned. The plan stays wherever the farm keeps it today — Excel, most likely — unless the farm asks for a planning feature later, which is its own scope again. |
| Catalog management | No new catalog screen for the product itself — that is Stoor's `Stoor.tsx`. Only `product_registrations` gets an admin form, and only for items the farm wants compliance fields on. |

## Build scope

1. **Schema** (`packages/schema/src/tables/bespuiting.ts`):
   - `product_registrations`: `farm_id`, `item_id` (FK → `stock_items`,
     unique), `active_ingredient`, `l_number` (nullable — not every product
     in PPP Info has one), `withholding_period` (free text, not a number —
     PPP Info's values are "None", "1 day", "28 days", "None - Not on
     Fruit"; forcing it into an integer loses the "not on fruit" case that
     matters). Not append-only — this is reference data the office edits in
     place, same shape as `stock_items` itself.
   - `spray_applications`: `workspaceRowColumns` (season-stamped) plus
     `block_id` (FK, required), `item_id` (FK → `stock_items`, required),
     `quantity`, `concentration` (free text, e.g. "500ml/100L water" —
     matches how the farm already writes it), `reason` (free text,
     prefilled client-side from `product_registrations` when present),
     `method` (free text — "Spray on trees", "Spray between rows", "Drench",
     the PPP Info vocabulary, never an enum, the farm has already shown it
     does not fit one), `operator_id` (FK → `people`), `water_point_id`
     (nullable FK → `water_points`), `weather` (same shape Veldnotas
     stamps), `gps` (same shape Veldnotas stamps). Append-only, registered
     in `captureTables` and `seasonStampedTables`.
2. **Field screen** (`apps/field/src/Bespuiting.tsx`): block picker
   (required), product picker (Stoor's cached catalog, unfiltered — any
   stock item can be applied, registered or not), quantity, concentration
   and reason (reason prefilled when the picked item has a registration),
   method, operator picker (same person list Span and Piecework already
   cache), optional Kraan/water-point picker with a reading field. GPS and
   weather captured the same way `Veldnotas.tsx` does. Offline badge and
   flush footer reused unchanged.
3. **`/sync/upload`**: `spray_applications` → `bespuiting` in the per-entity
   module map, idempotent by client uuid, held on a suspended/cancelled
   licence like every other module. On insert, the same handler also
   idempotently books a `stock_moves` `out` row (`item_id`, `quantity`,
   `block_id` copied across, `note` pointing back at the application) and,
   when a water point was picked, a `meter_readings` row — both under the
   application's own uuid so a retried sync never double-books. This is the
   one place a module's sync handler writes into two other modules' tables
   on purpose; Stoor's and Water's own code and rollups stay unaware
   Bespuiting exists.
4. **Office** (`services/api/src/routes/bespuiting.ts`):
   - `GET`/`POST`/`PATCH /product-registrations` — staff-gated, admin-only
     edit, same shape as Stoor's catalog routes.
   - `GET /eienaar/bespuiting` — applications in range, joined to block,
     product, and (when present) the registration, with the safe-harvest
     date computed at read time, never stored.
   - `GET /export/bespuiting.csv` — one row per application: date, block,
     product, active ingredient, concentration, method, operator, quantity,
     water point + reading if any, withholding period, computed safe-harvest
     date. This is the CSV that should be able to stand in for the paper
     book at an audit, unchanged from what the farm already hands over.
5. **Farm Admin Tool**: a `Bespuiting.tsx` panel — the `product_registrations`
   editor (admin-only, same visibility as Stoor's and Piecework's panels)
   plus a shared `BespuitingRollup` panel in `@plaashek/ui-office` (visible
   to both office tools, same as `StockRollup` and `WaterRollup`) and the
   CSV export button.
6. `bespuiting` added to `MODULE_TABS`. Where it lands in plan §11's order
   is a call for the farm, not this doc — it depends on Stoor and Water
   both being live at Bekfontein first, since it reads their catalogs.

## Deliberately not in this scope

- **The fertigation/spray plan itself** (which Kraan on which day, planned
  dosing per block). A schedule, not a capture — see the table above. If
  the farm wants the plan itself to move off Excel, that is worth scoping
  once the actuals side is proven, not bundled in here.
- **PHI as a hard block.** The withholding period drives a computed
  safe-harvest date on the record; it does not stop a capture or warn a
  worker mid-spray. Plan §8's rule holds here too — a save is never blocked
  over what the software thinks looks wrong.
- **Costing.** Same wall Stoor and Water both draw — Bespuiting answers
  what was applied and when it is safe to pick, never what it cost.
- **Editing or retiring a `product_registrations` row automatically when its
  `stock_items` row is retired.** They are linked by FK but managed
  separately; an inactive stock item simply stops appearing on the field
  picker, its registration row untouched.
