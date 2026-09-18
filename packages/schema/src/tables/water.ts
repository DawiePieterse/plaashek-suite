import { doublePrecision, pgTable, text, uuid } from "drizzle-orm/pg-core";
import { workspaceRowColumns } from "../workspace-row.js";
import { assets } from "./master-data.js";

/**
 * Water — a meter reading against the farm's own `assets` (a borehole, a
 * pump, a tank), not a new "meters" table (plan §4.5: one shared workspace;
 * docs/water-build-scope.md). Append-only, like every other capture — no
 * edit path (ADR 0006's precedent). Season-less (plan §6 names Water and
 * Werkswinkel), so `seasonId` stays null and this table is deliberately left
 * out of `seasonStampedTables`.
 */
export const meterReadings = pgTable("meter_readings", {
  ...workspaceRowColumns,
  assetId: uuid("asset_id")
    .notNull()
    .references(() => assets.id),
  reading: doublePrecision("reading").notNull(),
  note: text("note"),
});
