/**
 * ponytail: a localStorage outbox, not the real sync engine. ADR 0002 buys
 * PowerSync (SQLite/OPFS, CRUD queue, cursor pull) and that needs the service
 * running; this holds the same shape — queue locally, flush when there is
 * signal, keep what the server did not accept — so swapping it for
 * `createPlaashekConnector` in @plaashek/sync is a transport change, not a
 * redesign. Ceiling: localStorage is ~5MB and synchronous, so it is fine for
 * text notes and wrong for photos.
 */
export interface QueuedOp {
  entity: "notes";
  entity_id: string;
  client_time: string;
  season_id: string | null;
  payload: { body: string };
}

const QUEUE_KEY = "plaashek.field.outbox";

export function readQueue(): QueuedOp[] {
  try {
    const raw = globalThis.localStorage?.getItem(QUEUE_KEY);
    return raw ? (JSON.parse(raw) as QueuedOp[]) : [];
  } catch {
    // A corrupt outbox must not white-screen a phone mid-pick.
    return [];
  }
}

function writeQueue(ops: QueuedOp[]) {
  globalThis.localStorage?.setItem(QUEUE_KEY, JSON.stringify(ops));
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
