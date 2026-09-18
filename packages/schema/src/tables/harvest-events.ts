import { doublePrecision, pgTable, text, uuid } from "drizzle-orm/pg-core";
import { workspaceRowColumns } from "../workspace-row.js";
import { blocks } from "./master-data.js";
import { people } from "./people.js";

/**
 * Boord — the second field module (plan §11, docs/boord-reuse-audit.md).
 * Append-only, same as `notes`: no edit path (ADR 0006's precedent) — a
 * correction is a new capture.
 *
 * `pickerId` and `pickerCardCode` were added for seasonal piece-work
 * (ADR 0009, docs/piecework-build-scope.md), superseding ADR 0007's refusal
 * of per-crate attribution. Both stay nullable: a farm running Boord without
 * piece-work is unchanged, and a card the phone could not resolve must never
 * block the crate (plan §8).
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
  /** Who picked this crate, resolved from the scanned card — not `createdBy`, which is the supervisor's device. */
  pickerId: uuid("picker_id").references(() => people.id),
  /** What was actually scanned, kept even once resolved: it is the evidence behind the attribution. */
  pickerCardCode: text("picker_card_code"),
});
