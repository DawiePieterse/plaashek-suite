import type { AbstractPowerSyncDatabase, PowerSyncBackendConnector, PowerSyncCredentials } from "@powersync/web";
import type { OutboxOp } from "./types.js";

/**
 * Fetches a fresh PowerSync JWT for the currently paired device. Backed by
 * whatever this device's ticket is (see plan §3.4, `@plaashek/tickets`) —
 * this package does not sign tokens, only asks for one.
 */
export interface TokenProvider {
  /**
   * Must always fetch fresh — PowerSyncBackendConnector.fetchCredentials
   * forbids returning a cached value. Return null if this device has no
   * live ticket (unpaired, expired, or revoked).
   */
  fetchCredentials(): Promise<PowerSyncCredentials | null>;
}

/** Sends a drained batch of local writes to services/api's sync-api upload endpoint. */
export interface UploadTransport {
  /** Throw on failure — PowerSync retries uploadData after a wait period on any thrown error. */
  upload(ops: OutboxOp[]): Promise<void>;
}

/**
 * Builds the PowerSyncBackendConnector this device's field app hands to
 * `new PowerSyncDatabase(...)`. See ADR 0002 for why PowerSync owns the
 * local store and the CRUD queue, and why conflict resolution (conflict.ts)
 * stays outside of PowerSync, in services/api's upload handler.
 */
export function createPlaashekConnector(deps: {
  tokens: TokenProvider;
  transport: UploadTransport;
}): PowerSyncBackendConnector {
  return {
    async fetchCredentials() {
      return deps.tokens.fetchCredentials();
    },

    async uploadData(database: AbstractPowerSyncDatabase) {
      const batch = await database.getCrudBatch();
      if (!batch) return;

      const ops: OutboxOp[] = batch.crud.map((entry) => ({
        entity: entry.table,
        entity_id: entry.id,
        op: entry.op as OutboxOp["op"],
        payload: entry.opData ?? null,
        client_time: new Date().toISOString(),
        photo_ids: extractPhotoIds(entry.opData),
      }));

      await deps.transport.upload(ops);
      await batch.complete();
    },
  };
}

function extractPhotoIds(opData: Record<string, unknown> | undefined): string[] {
  const raw = opData?.["photo_ids"];
  return Array.isArray(raw) ? raw.filter((id): id is string => typeof id === "string") : [];
}
