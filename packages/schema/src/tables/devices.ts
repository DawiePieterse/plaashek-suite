import { pgTable, text, timestamp, unique, uuid } from "drizzle-orm/pg-core";
import { farms } from "./core.js";
import { farmMemberships, people } from "./people.js";

export const devices = pgTable("devices", {
  id: uuid("id").primaryKey().defaultRandom(),
  farmId: uuid("farm_id")
    .notNull()
    .references(() => farms.id),
  label: text("label"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

/**
 * Append-only history — a reassignment inserts a new row rather than
 * updating one (plan §3.4). Current assignment = latest row per device.
 */
export const deviceAssignments = pgTable("device_assignments", {
  id: uuid("id").primaryKey().defaultRandom(),
  deviceId: uuid("device_id")
    .notNull()
    .references(() => devices.id),
  personId: uuid("person_id")
    .notNull()
    .references(() => people.id),
  assignedAt: timestamp("assigned_at", { withTimezone: true }).notNull().defaultNow(),
  assignedBy: uuid("assigned_by")
    .notNull()
    .references(() => farmMemberships.id),
});

/**
 * A printed QR slip. State is derived from the three nullable timestamps
 * (used_at / cancelled_at / expires_at vs now), not a stored status column —
 * plan §3.4 pending/used/cancelled/expired are all read off these.
 */
export const pairingTokens = pgTable("pairing_tokens", {
  id: uuid("id").primaryKey().defaultRandom(),
  deviceId: uuid("device_id")
    .notNull()
    .references(() => devices.id),
  moduleCode: text("module_code").notNull(),
  token: text("token").notNull().unique(),
  printedAt: timestamp("printed_at", { withTimezone: true }).notNull().defaultNow(),
  printedBy: uuid("printed_by")
    .notNull()
    .references(() => farmMemberships.id),
  /** 48 hours from printedAt, set by application logic — not a schema default (ADR 0003 is about ticket life, not token life; §3.4 states 48h explicitly). */
  expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
  usedAt: timestamp("used_at", { withTimezone: true }),
  cancelledAt: timestamp("cancelled_at", { withTimezone: true }),
});

/** Row only exists after a successful QR scan — plan §6. This is the device's "floor". */
export const deviceModules = pgTable(
  "device_modules",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    deviceId: uuid("device_id")
      .notNull()
      .references(() => devices.id),
    moduleCode: text("module_code").notNull(),
    pairedAt: timestamp("paired_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [unique().on(table.deviceId, table.moduleCode)],
);
