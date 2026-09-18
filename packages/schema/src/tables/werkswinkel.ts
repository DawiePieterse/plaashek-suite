import { doublePrecision, pgTable, text, uuid } from "drizzle-orm/pg-core";
import { workspaceRowColumns } from "../workspace-row.js";
import { assets } from "./master-data.js";

/**
 * Werkswinkel's fuel register — litres against the farm's own `assets`
 * (docs/werkswinkel-build-scope.md). Append-only, like every other capture.
 * Season-less (plan §6), same as Water — left out of `seasonStampedTables`.
 */
export const fuelLogs = pgTable("fuel_logs", {
  ...workspaceRowColumns,
  assetId: uuid("asset_id")
    .notNull()
    .references(() => assets.id),
  litresUsed: doublePrecision("litres_used").notNull(),
  odometerKm: doublePrecision("odometer_km"),
  note: text("note"),
});

/**
 * Werkswinkel's issue register. A "status change" is a new append-only row
 * against the same asset, not an edit to a prior one — the office reads the
 * sequence, and the most recent row per asset is the current state
 * (docs/werkswinkel-build-scope.md, the same simplification Span's punch
 * pairs use but without needing elapsed time).
 */
export const workOrders = pgTable("work_orders", {
  ...workspaceRowColumns,
  assetId: uuid("asset_id")
    .notNull()
    .references(() => assets.id),
  description: text("description").notNull(),
  /** `open` or `closed`. Text, not an enum — same reasoning as Span's `direction` column. */
  status: text("status").notNull(),
});
