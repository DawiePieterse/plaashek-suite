import { sql } from "drizzle-orm";
import { boolean, pgEnum, pgTable, text, timestamp, uniqueIndex, uuid } from "drizzle-orm/pg-core";
import { farms } from "./core.js";

export const personKind = pgEnum("person_kind", ["staff", "seasonal"]);

/**
 * A name to stamp records with. No login, no password, no email — plan §6.
 * Most people on a farm are only ever this.
 *
 * `kind` splits the two populations the farm actually runs: permanent staff,
 * who may carry a paired phone (Span, ADR 0008), and seasonal piece-workers,
 * who carry a printed card instead (ADR 0009). It keeps forty pickers out of
 * the device-assignment list without giving them a second table — a picker
 * is a person, and their crates stamp the same `people` row as anyone else.
 *
 * `workerNumber` is the farm's own number for this person, typed by the
 * office and printed on their card (ADR 0011). It is the join key the farm's
 * payment system already uses, which is why it is theirs to set and not
 * ours to generate.
 */
export const people = pgTable(
  "people",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    farmId: uuid("farm_id")
      .notNull()
      .references(() => farms.id),
    name: text("name").notNull(),
    kind: personKind("kind").notNull().default("staff"),
    /** The farm's number for this person. Null for anyone the farm never numbered. */
    workerNumber: text("worker_number"),
    /** A worker who has left. Their captures keep their attribution; new scans of their number do not resolve. */
    active: boolean("active").notNull().default(true),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  // One number, one person, per farm — the whole point of it being a join
  // key. Partial, because most people on a farm are never numbered.
  (table) => [
    uniqueIndex("people_worker_number_per_farm")
      .on(table.farmId, table.workerNumber)
      .where(sql`${table.workerNumber} is not null`),
  ],
);

export const membershipRole = pgEnum("membership_role", ["admin", "owner"]);

/** Office logins only — Farm Admin Tool (admin) and Owner Module (owner). Plan §3.1. */
export const farmMemberships = pgTable("farm_memberships", {
  id: uuid("id").primaryKey().defaultRandom(),
  farmId: uuid("farm_id")
    .notNull()
    .references(() => farms.id),
  personId: uuid("person_id")
    .notNull()
    .references(() => people.id),
  email: text("email").notNull().unique(),
  /** Nullable — email/password or magic link, plan §3.1. */
  passwordHash: text("password_hash"),
  role: membershipRole("role").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});
