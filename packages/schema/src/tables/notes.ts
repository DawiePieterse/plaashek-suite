import { jsonb, pgTable, text, timestamp, unique, uuid } from "drizzle-orm/pg-core";
import { workspaceRowColumns } from "../workspace-row.js";

/** Veldnotas — the first module (plan §11). Append-only events: a note is never edited, only added. */
export const notes = pgTable("notes", {
  ...workspaceRowColumns,
  body: text("body").notNull(),
});

/**
 * Plan §5: a capture that arrives while the licence is `suspended` or `cancelled`
 * is held, never dropped — "lisensie het verval, 14 items wag". Reactivation
 * replays these into their module's own table.
 */
export const heldWrites = pgTable(
  "held_writes",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    farmId: uuid("farm_id").notNull(),
    moduleCode: text("module_code").notNull(),
    deviceId: uuid("device_id").notNull(),
    entity: text("entity").notNull(),
    entityId: uuid("entity_id").notNull(),
    payload: jsonb("payload").notNull(),
    clientTime: timestamp("client_time", { withTimezone: true }).notNull(),
    receivedAt: timestamp("received_at", { withTimezone: true }).notNull().defaultNow(),
    releasedAt: timestamp("released_at", { withTimezone: true }),
  },
  // Same guard the module tables get from their primary key: a phone that
  // retries an upload whose response was lost must not double the capture.
  (table) => [unique().on(table.entity, table.entityId)],
);
