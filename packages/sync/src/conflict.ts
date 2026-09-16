import type { TableKind, WorkspaceRow } from "./types.js";

export interface ConflictResult<T extends WorkspaceRow> {
  action: "apply" | "keep_both" | "ignore";
  row: T;
  flagForOffice?: boolean;
}

/**
 * Decide what services/api's upload handler should do with an incoming
 * write, given what (if anything) already exists at that id. Plan §7:
 * "last-write-wins on scalars; append-only for events ... Two edits to the
 * same animal tag: keep both, flag the office."
 *
 * This function only decides; it does not write to Postgres and does not
 * know about specific tables (crates vs animals vs punches) — the caller
 * passes the `kind` it has registered for that table.
 */
export function resolveWrite<T extends WorkspaceRow>(
  kind: TableKind,
  existing: T | null,
  incoming: T,
): ConflictResult<T> {
  if (kind === "event") {
    if (existing) {
      // Same id arriving twice is a retry of the same event, not a second
      // one — idempotent, do not double-insert.
      return { action: "ignore", row: existing };
    }
    return { action: "apply", row: incoming };
  }

  if (!existing) {
    return { action: "apply", row: incoming };
  }

  if (incoming.rev > existing.rev) {
    return { action: "apply", row: incoming };
  }

  if (incoming.rev === existing.rev && incoming.updated_at !== existing.updated_at) {
    // Two devices both started from the same base rev before either synced.
    // Do not silently pick a winner — the caller inserts `incoming` under a
    // new id as a flagged duplicate for the office to reconcile.
    return { action: "keep_both", row: incoming, flagForOffice: true };
  }

  return { action: "ignore", row: existing };
}
