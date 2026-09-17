import { doublePrecision, pgTable, text, uuid } from "drizzle-orm/pg-core";
import { workspaceRowColumns } from "../workspace-row.js";
import { blocks } from "./master-data.js";

/**
 * Boord — the second field module (plan §11, docs/boord-reuse-audit.md).
 * Append-only, same as `notes`: no worker/team attribution (ADR 0007), no
 * edit path (ADR 0006's precedent) — a correction is a new capture.
 */
export const harvestEvents = pgTable("harvest_events", {
  ...workspaceRowColumns,
  blockId: uuid("block_id")
    .notNull()
    .references(() => blocks.id),
  weightKg: doublePrecision("weight_kg").notNull(),
  deductionKg: doublePrecision("deduction_kg"),
  weatherTemp: doublePrecision("weather_temp"),
  weatherHumidity: doublePrecision("weather_humidity"),
  weatherCondition: text("weather_condition"),
});
