/**
 * ponytail: a localStorage outbox, not the real sync engine. ADR 0002 buys
 * PowerSync (SQLite/OPFS, CRUD queue, cursor pull) and that needs the service
 * running; this holds the same shape — queue locally, flush when there is
 * signal, keep what the server did not accept — so swapping it for
 * `createPlaashekConnector` in @plaashek/sync is a transport change, not a
 * redesign. Ceiling: localStorage is ~5MB and synchronous, so it is fine for
 * text notes and wrong for photos.
 */
export interface NoteOp {
  entity: "notes";
  entity_id: string;
  client_time: string;
  season_id: string | null;
  payload: {
    body: string;
    block_id?: string | null;
    latitude?: number | null;
    longitude?: number | null;
    location_accuracy_m?: number | null;
    weather_temp?: number | null;
    weather_humidity?: number | null;
    weather_condition?: string | null;
  };
}

/** Boord capture (docs/boord-reuse-audit.md): block + weight + optional deduction. */
export interface HarvestEventOp {
  entity: "harvest_events";
  entity_id: string;
  client_time: string;
  season_id: string | null;
  payload: {
    block_id: string;
    weight_kg: number;
    deduction_kg?: number | null;
    weather_temp?: number | null;
    weather_humidity?: number | null;
    weather_condition?: string | null;
  };
}

export type QueuedOp = NoteOp | HarvestEventOp;

const QUEUE_KEY = "plaashek.field.outbox";

/**
 * Version 1 shape. Version 0 (pre-migration) was a bare `QueuedOp[]` with no
 * wrapper — that shipped first, so it must still read back intact rather than
 * be treated as corrupt (plan §8: migration must never lose the outbox).
 * ponytail: one hand-rolled upgrade step, not a migration registry. Add a
 * second `if` here when a v2 shape actually exists.
 */
const SCHEMA_VERSION = 1;

interface StoredQueue {
  version: number;
  ops: QueuedOp[];
}

function migrate(parsed: unknown): QueuedOp[] {
  if (Array.isArray(parsed)) return parsed as QueuedOp[]; // v0 -> v1: same ops, just wrap on next write
  if (parsed && typeof parsed === "object" && Array.isArray((parsed as StoredQueue).ops)) {
    return (parsed as StoredQueue).ops;
  }
  return [];
}

export function readQueue(): QueuedOp[] {
  try {
    const raw = globalThis.localStorage?.getItem(QUEUE_KEY);
    if (!raw) return [];
    return migrate(JSON.parse(raw));
  } catch {
    // A corrupt outbox must not white-screen a phone mid-pick.
    return [];
  }
}

function writeQueue(ops: QueuedOp[]) {
  const stored: StoredQueue = { version: SCHEMA_VERSION, ops };
  globalThis.localStorage?.setItem(QUEUE_KEY, JSON.stringify(stored));
}

/** The save the picker sees: local and instant, never a network call (plan §8). */
export function enqueue(op: QueuedOp): QueuedOp[] {
  const ops = [...readQueue(), op];
  writeQueue(ops);
  return ops;
}

/**
 * Drops only what the server confirmed. Anything it did not name stays queued,
 * including writes added while the flush was in flight.
 */
export function settle(accepted: string[]): QueuedOp[] {
  const remaining = readQueue().filter((op) => !accepted.includes(op.entity_id));
  writeQueue(remaining);
  return remaining;
}
