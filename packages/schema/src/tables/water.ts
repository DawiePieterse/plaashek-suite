import { boolean, doublePrecision, pgTable, text, timestamp, uuid } from "drizzle-orm/pg-core";
import { workspaceRowColumns } from "../workspace-row.js";
import { farms } from "./core.js";

/**
 * Water's catalog (plan §11, docs/water-build-scope.md) — master data, the
 * same shape as Stoor's `stock_items`: the office defines a point once, in
 * whatever unit it already reads it in, and every reading just names the
 * point and a value. `active` retires a decommissioned point without
 * deleting the readings already logged against it.
 */
export const waterPoints = pgTable("water_points", {
  id: uuid("id").primaryKey().defaultRandom(),
  farmId: uuid("farm_id")
    .notNull()
    .references(() => farms.id),
  name: text("name").notNull(),
  /** Whatever the farm already calls it — "m³", "kL", a level in "m" — free text, never enforced. */
  unit: text("unit").notNull(),
  active: boolean("active").notNull().default(true),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

/**
 * One number, whatever it means for this point — a cumulative meter total
 * or a level (docs/water-build-scope.md). Append-only like every other
 * capture: a misread number is followed by a correct one, not edited away.
 * `season_id` is always null — Water is season-less (plan §6, §8).
 */
export const meterReadings = pgTable("meter_readings", {
  ...workspaceRowColumns,
  waterPointId: uuid("water_point_id")
    .notNull()
    .references(() => waterPoints.id),
  reading: doublePrecision("reading").notNull(),
  note: text("note"),
});
