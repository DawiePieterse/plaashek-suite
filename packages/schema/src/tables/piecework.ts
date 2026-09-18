import { date, doublePrecision, integer, pgTable, timestamp, text, unique, uuid } from "drizzle-orm/pg-core";
import { farms } from "./core.js";
import { farmMemberships, people } from "./people.js";
import { seasons } from "./master-data.js";

/**
 * The printed card a seasonal picker carries, scanned at the scale to say who
 * filled this crate (ADR 0009, docs/piecework-build-scope.md). A bearer
 * identifier, not a credential: it grants no access and reads no data, so the
 * worst a lost card does is misattribute pay until it is revoked.
 *
 * Reissue mints a new row with a new code rather than editing this one — the
 * old code stays in `harvest_events.picker_card_code` on every crate it ever
 * stamped, so history still reads correctly after a card is replaced.
 */
export const workerCards = pgTable(
  "worker_cards",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    farmId: uuid("farm_id")
      .notNull()
      .references(() => farms.id),
    personId: uuid("person_id")
      .notNull()
      .references(() => people.id),
    /** Printed as a QR and in readable characters, for the phone that cannot scan. */
    code: text("code").notNull(),
    issuedAt: timestamp("issued_at", { withTimezone: true }).notNull().defaultNow(),
    /** The office login that printed it — same convention as a pairing slip's `printedBy`. */
    issuedBy: uuid("issued_by")
      .notNull()
      .references(() => farmMemberships.id),
    revokedAt: timestamp("revoked_at", { withTimezone: true }),
  },
  // Codes are farm-scoped: two farms may not share one, and no farm may
  // issue the same code twice (plan §6: no cross-farm anything).
  (table) => [unique().on(table.farmId, table.code)],
);

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
