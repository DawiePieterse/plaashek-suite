import { pgEnum, pgTable, text, timestamp, uuid } from "drizzle-orm/pg-core";
import { farms } from "./core.js";

export const auditActorType = pgEnum("audit_actor_type", ["farm", "staff"]);

/**
 * Staff support access, revokes, entitlement changes, QR prints — plan §6.
 * Farm-visible for its own farm.
 */
export const auditLog = pgTable("audit_log", {
  id: uuid("id").primaryKey().defaultRandom(),
  actor: text("actor").notNull(),
  actorType: auditActorType("actor_type").notNull(),
  action: text("action").notNull(),
  target: text("target").notNull(),
  farmId: uuid("farm_id").references(() => farms.id),
  at: timestamp("at", { withTimezone: true }).notNull().defaultNow(),
});
