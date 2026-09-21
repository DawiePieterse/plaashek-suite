import { doublePrecision, pgTable, text, timestamp, unique, uuid } from "drizzle-orm/pg-core";
import { workspaceRowColumns } from "../workspace-row.js";
import { farms } from "./core.js";
import { blocks } from "./master-data.js";
import { stockItems } from "./stock.js";
import { waterPoints } from "./water.js";

/**
 * Compliance metadata for a Stoor item that needs it (docs/bespuiting-build-scope.md).
 * Deliberately not columns on `stock_items` itself — Stoor's own build scope
 * ruled that out ("a stricter chemical-application record... its own scope,
 * not a column bolted onto this one"). Only items a farm actually sprays get
 * a row here; fertiliser and fuel never do.
 */
export const productRegistrations = pgTable(
  "product_registrations",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    farmId: uuid("farm_id")
      .notNull()
      .references(() => farms.id),
    itemId: uuid("item_id")
      .notNull()
      .references(() => stockItems.id),
    activeIngredient: text("active_ingredient").notNull(),
    /** PPP Info's own default reason per product — prefilled onto a new capture and editable there. */
    defaultReason: text("default_reason"),
    lNumber: text("l_number"),
    /** Free text, never a number: real values include "28 dae", "Geen", "Geen — nie op vrugte nie". */
    withholdingPeriod: text("withholding_period"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [unique().on(table.itemId)],
);

/**
 * A chemical or fertigation application (docs/bespuiting-build-scope.md) —
 * block, product and how much, plus the compliance fields Stoor's own scope
 * deliberately left out. Optionally tied to a water point and a reading when
 * it was a fertigation run through a Kraan rather than a foliar spray.
 *
 * Append-only like every other capture. Weather and GPS are stamped here,
 * unlike Stoor and Water — this happens in the orchard, not at the store or
 * a fixed meter. There is no operator field: like every other module,
 * "who" is the person the device was assigned to at save time (plan §3.2),
 * never a picker on screen (identity comes from paper, not a list of names).
 */
export const sprayApplications = pgTable("spray_applications", {
  ...workspaceRowColumns,
  blockId: uuid("block_id")
    .notNull()
    .references(() => blocks.id),
  itemId: uuid("item_id")
    .notNull()
    .references(() => stockItems.id),
  quantity: doublePrecision("quantity").notNull(),
  concentration: text("concentration"),
  reason: text("reason"),
  method: text("method"),
  waterPointId: uuid("water_point_id").references(() => waterPoints.id),
  meterReading: doublePrecision("meter_reading"),
  latitude: doublePrecision("latitude"),
  longitude: doublePrecision("longitude"),
  locationAccuracyM: doublePrecision("location_accuracy_m"),
  weatherTemp: doublePrecision("weather_temp"),
  weatherHumidity: doublePrecision("weather_humidity"),
  weatherCondition: text("weather_condition"),
});
