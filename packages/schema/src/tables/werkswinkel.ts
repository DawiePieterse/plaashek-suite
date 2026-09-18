import { doublePrecision, pgTable, text, uuid } from "drizzle-orm/pg-core";
import { workspaceRowColumns } from "../workspace-row.js";
import { assets } from "./master-data.js";

/**
 * A job's whole lifecycle is two append-only rows, paired at read time —
 * Span's shape (docs/werkswinkel-build-scope.md), not a status column
 * edited in place. `description` is the fault on `opened`, what was done
 * on `closed`; both are optional so a quick close needs no typing.
 * `season_id` is always null — Werkswinkel is season-less (plan §6, §8).
 */
export const workOrders = pgTable("work_orders", {
  ...workspaceRowColumns,
  assetId: uuid("asset_id")
    .notNull()
    .references(() => assets.id),
  /** `opened` or `closed`. */
  event: text("event").notNull(),
  description: text("description"),
});

/**
 * One fill-up, one row (docs/werkswinkel-build-scope.md) — no lifecycle, no
 * pairing, closer in shape to a single-direction Stoor move. `meterReading`
 * is optional: whatever the asset's own odometer or hour-meter said at the
 * pump, useful for consumption later but never required to save.
 */
export const fuelLogs = pgTable("fuel_logs", {
  ...workspaceRowColumns,
  assetId: uuid("asset_id")
    .notNull()
    .references(() => assets.id),
  litres: doublePrecision("litres").notNull(),
  meterReading: doublePrecision("meter_reading"),
  note: text("note"),
});
