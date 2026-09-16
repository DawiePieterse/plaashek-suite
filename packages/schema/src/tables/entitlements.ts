import { integer, pgEnum, pgTable, text, timestamp, unique, uuid } from "drizzle-orm/pg-core";
import { farms } from "./core.js";

/** Plan §5. Field workers never see this; office/owner only. */
export const entitlementStatus = pgEnum("entitlement_status", [
  "active",
  "grace",
  "suspended",
  "cancelled",
]);

export const entitlements = pgTable(
  "entitlements",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    farmId: uuid("farm_id")
      .notNull()
      .references(() => farms.id),
    /** Not an enum — must allow `custom:*` (plan §4.5). */
    moduleCode: text("module_code").notNull(),
    status: entitlementStatus("status").notNull().default("active"),
    validFrom: timestamp("valid_from", { withTimezone: true }).notNull().defaultNow(),
    validUntil: timestamp("valid_until", { withTimezone: true }),
    /** Fixed default per ADR 0003, not a per-farm setting. */
    graceDays: integer("grace_days").notNull().default(14),
    /** How the entitlement got activated, e.g. "manual" this year (ADR 0004) — so a future payment-gateway integration's rows don't need backfill. */
    source: text("source").notNull().default("manual"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [unique().on(table.farmId, table.moduleCode)],
);
