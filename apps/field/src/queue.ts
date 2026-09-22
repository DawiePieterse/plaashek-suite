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
    /** The scanned worker card (ADR 0009). The server turns it into a picker — the phone never asserts one. */
    picker_card_code?: string | null;
    weather_temp?: number | null;
    weather_humidity?: number | null;
    weather_condition?: string | null;
  };
}

/** Span punch (docs/span-build-scope.md): a direction, and where the phone was if it had a fix. */
export interface AttendancePunchOp {
  entity: "attendance_punches";
  entity_id: string;
  client_time: string;
  season_id: string | null;
  payload: {
    direction: "in" | "out";
    latitude?: number | null;
    longitude?: number | null;
    location_accuracy_m?: number | null;
  };
}

/** Stoor's move (docs/stoor-build-scope.md): which item, which way, how much. */
export interface StockMoveOp {
  entity: "stock_moves";
  entity_id: string;
  client_time: string;
  season_id: string | null;
  payload: {
    item_id: string;
    direction: "in" | "out";
    quantity: number;
    block_id?: string | null;
    note?: string | null;
  };
}

/** Water's reading (docs/water-build-scope.md): which point, what value. `season_id` is always null — enforced by the server schema too, not just this type. */
export interface MeterReadingOp {
  entity: "meter_readings";
  entity_id: string;
  client_time: string;
  season_id: null;
  payload: {
    water_point_id: string;
    reading: number;
    note?: string | null;
  };
}

/** Half of a job's lifecycle (docs/werkswinkel-build-scope.md) — `opened` or `closed`, paired server-side. `season_id` is always null — enforced by the server schema too. */
export interface WorkOrderOp {
  entity: "work_orders";
  entity_id: string;
  client_time: string;
  season_id: null;
  payload: {
    asset_id: string;
    event: "opened" | "closed";
    description?: string | null;
  };
}

/** One fill-up (docs/werkswinkel-build-scope.md). `season_id` is always null — enforced by the server schema too. */
export interface FuelLogOp {
  entity: "fuel_logs";
  entity_id: string;
  client_time: string;
  season_id: null;
  payload: {
    asset_id: string;
    litres: number;
    meter_reading?: number | null;
    note?: string | null;
  };
}

/**
 * Bespuiting capture (docs/bespuiting-build-scope.md): block, product, how
 * much, plus the compliance fields Stoor never carries. `water_point_id`
 * and `meter_reading` are only sent on a fertigation run through a Kraan.
 * No operator field — "who" is the device's assigned person, same as every
 * other module.
 */
export interface SprayApplicationOp {
  entity: "spray_applications";
  entity_id: string;
  client_time: string;
  season_id: string | null;
  payload: {
    block_id: string;
    item_id: string;
    quantity: number;
    concentration?: string | null;
    reason?: string | null;
    method?: string | null;
    water_point_id?: string | null;
    meter_reading?: number | null;
    latitude?: number | null;
    longitude?: number | null;
    location_accuracy_m?: number | null;
    weather_temp?: number | null;
    weather_humidity?: number | null;
    weather_condition?: string | null;
  };
}

export type QueuedOp =
  | NoteOp
  | HarvestEventOp
  | AttendancePunchOp
  | StockMoveOp
  | MeterReadingOp
  | WorkOrderOp
  | FuelLogOp
  | SprayApplicationOp;

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
