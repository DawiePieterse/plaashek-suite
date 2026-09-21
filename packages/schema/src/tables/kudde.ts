import { sql } from "drizzle-orm";
import { boolean, date, doublePrecision, pgTable, text, timestamp, uniqueIndex, uuid } from "drizzle-orm/pg-core";
import { workspaceRowColumns } from "../workspace-row.js";
import { farms } from "./core.js";
import { camps } from "./master-data.js";

/**
 * Kudde's register (docs/kudde-build-scope.md, ADR 0014) — master data, the
 * same shape as `people`: the farm identifies the animal, Plaashek never
 * mints the identifier. `tagNumber` is the farm's own oormerk (ADR 0011's
 * pattern), nullable because a newborn is sometimes recorded before it is
 * tagged. `sex` is free text rather than an enum — "cow"/"bull"/"calf" today,
 * but a farm's own vocabulary for its herd is not ours to fix in a migration.
 * `active` retires a sold or dead animal without deleting its movement,
 * treatment or weight history, the same reasoning ADR 0011 used for a
 * worker who has left.
 */
export const animals = pgTable(
  "animals",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    farmId: uuid("farm_id")
      .notNull()
      .references(() => farms.id),
    tagNumber: text("tag_number"),
    sex: text("sex").notNull(),
    breed: text("breed"),
    birthDate: date("birth_date"),
    active: boolean("active").notNull().default(true),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  // One tag, one animal, per farm — partial, because not every animal is tagged yet.
  (table) => [
    uniqueIndex("animals_tag_number_per_farm")
      .on(table.farmId, table.tagNumber)
      .where(sql`${table.tagNumber} is not null`),
  ],
);

/**
 * One animal's camp change (docs/kudde-build-scope.md, ADR 0014) — one row
 * per animal even when a whole group moves in a single field action, so a
 * later treatment or weight always lands on an animal with a real location
 * history rather than an averaged herd position. `fromCampId` is nullable:
 * an animal's first recorded movement, or one bought in, has no "from".
 * Append-only like every other capture — a wrong move is followed by a
 * correcting one, never edited.
 */
export const movements = pgTable("movements", {
  ...workspaceRowColumns,
  animalId: uuid("animal_id")
    .notNull()
    .references(() => animals.id),
  toCampId: uuid("to_camp_id")
    .notNull()
    .references(() => camps.id),
  fromCampId: uuid("from_camp_id").references(() => camps.id),
});

/**
 * A vaccination, a dip, a dose — whatever the farm calls it
 * (docs/kudde-build-scope.md). `treatmentType` and `dose` are free text, the
 * same "farm's own words, never a picklist we maintain" stance as Stoor's
 * `unit`. Append-only, no compliance fields — a regulated record is a
 * different, stricter scope, not a column bolted onto this one.
 */
export const treatments = pgTable("treatments", {
  ...workspaceRowColumns,
  animalId: uuid("animal_id")
    .notNull()
    .references(() => animals.id),
  treatmentType: text("treatment_type").notNull(),
  dose: text("dose"),
  note: text("note"),
});

/**
 * One weighing, one row — no cadence enforced, the same "capture what
 * happened, never demand a schedule" stance as `meter_readings`
 * (docs/kudde-build-scope.md). Append-only.
 */
export const weights = pgTable("weights", {
  ...workspaceRowColumns,
  animalId: uuid("animal_id")
    .notNull()
    .references(() => animals.id),
  weightKg: doublePrecision("weight_kg").notNull(),
});
