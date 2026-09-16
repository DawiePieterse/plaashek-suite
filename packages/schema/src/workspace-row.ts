import { integer, text, timestamp, uuid } from "drizzle-orm/pg-core";

/**
 * The 9-column stamp every module's captured-data table carries (plan §6,
 * docs/seasons-and-stamping.md). Spread into a module table's own pgTable
 * columns once a module (veldnotas, boord, ...) is actually built — no
 * table uses this yet in Phase 1.
 */
export const workspaceRowColumns = {
  id: uuid("id").primaryKey().defaultRandom(),
  farmId: uuid("farm_id").notNull(),
  moduleCode: text("module_code").notNull(),
  /** Resolved on the device from its synced active season, not by the server. Null for season-less modules. */
  seasonId: uuid("season_id"),
  /** The person assigned to the device at save time, not a logged-in user. */
  createdBy: uuid("created_by").notNull(),
  deviceId: uuid("device_id").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  revokedAt: timestamp("revoked_at", { withTimezone: true }),
  rev: integer("rev").notNull().default(1),
};

export interface WorkspaceRow {
  id: string;
  farm_id: string;
  module_code: string;
  season_id: string | null;
  created_by: string;
  device_id: string;
  created_at: string;
  updated_at: string;
  revoked_at: string | null;
  rev: number;
}
