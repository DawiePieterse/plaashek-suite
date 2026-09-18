import { pgEnum, pgTable, text, timestamp, uuid } from "drizzle-orm/pg-core";
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
 */
export const people = pgTable("people", {
  id: uuid("id").primaryKey().defaultRandom(),
  farmId: uuid("farm_id")
    .notNull()
    .references(() => farms.id),
  name: text("name").notNull(),
  kind: personKind("kind").notNull().default("staff"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

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
