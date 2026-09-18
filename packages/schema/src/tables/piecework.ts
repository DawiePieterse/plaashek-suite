import { date, doublePrecision, integer, pgTable, timestamp, uuid } from "drizzle-orm/pg-core";
import { farms } from "./core.js";
import { seasons } from "./master-data.js";

/**
 * What a kilogram is worth, tiered (ADR 0010): `base` up to `targetKg` picked
 * in a day, `bonus` for every kilogram above it. Integer cents — never a float
 * for money.
 *
 * Effective-dated and never edited in place: a rate change mid-season must not
 * restate what last week already earned, so a change is a new row and the
 * calculation reads whichever row was in force on the day of the pick.
 */
export const pieceRates = pgTable("piece_rates", {
  id: uuid("id").primaryKey().defaultRandom(),
  farmId: uuid("farm_id")
    .notNull()
    .references(() => farms.id),
  seasonId: uuid("season_id")
    .notNull()
    .references(() => seasons.id),
  effectiveFrom: date("effective_from").notNull(),
  baseCentsPerKg: integer("base_cents_per_kg").notNull(),
  /** Null means no tier: everything pays `base`. */
  targetKg: doublePrecision("target_kg"),
  bonusCentsPerKg: integer("bonus_cents_per_kg"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});
