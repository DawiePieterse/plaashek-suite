/**
 * Shared shapes for the sync path. Mirrors plan §6 (workspace row stamp) and
 * §7 (outbox), and docs/seasons-and-stamping.md.
 */

/** Every workspace row carries these fields, whatever module it belongs to. */
export interface WorkspaceRow {
  id: string;
  farm_id: string;
  module_code: string;
  /** Resolved on the device from its synced copy of the active season. Null for season-less modules (Werkswinkel, Water). */
  season_id: string | null;
  /** The person assigned to the device at save time, not a logged-in user. */
  created_by: string;
  device_id: string;
  created_at: string;
  updated_at: string;
  revoked_at: string | null;
  rev: number;
}

/**
 * Whether a table takes last-write-wins (a mutable record like a stock
 * balance or an animal profile) or is append-only (an event like a crate
 * weigh-in, a treatment, a punch, a note — plan §7 names these explicitly).
 * Callers register each table's kind; this package does not hardcode a
 * table list because only veldnotas/boord/eienaar are being built (ADR 0001).
 */
export type TableKind = "scalar" | "event";

/**
 * The shape this package's connector sends to services/api's upload
 * endpoint, one per PowerSync CrudEntry. `photo_ids` is pulled out of the
 * payload because photos sync over the separate lazy channel (plan §7),
 * not through PowerSync.
 */
export interface OutboxOp {
  entity: string;
  entity_id: string;
  op: "PUT" | "PATCH" | "DELETE";
  payload: Record<string, unknown> | null;
  client_time: string;
  photo_ids: string[];
}
