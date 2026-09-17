import assert from "node:assert/strict";
import test from "node:test";

// A phone's localStorage, in memory — queue.ts reads it at call time, not import time.
const store = new Map<string, string>();
globalThis.localStorage = {
  getItem: (key: string) => store.get(key) ?? null,
  setItem: (key: string, value: string) => void store.set(key, value),
  removeItem: (key: string) => void store.delete(key),
  clear: () => store.clear(),
  key: () => null,
  length: 0,
} as Storage;

const { enqueue, readQueue, settle } = await import("./queue.ts");

const note = (id: string) => ({
  entity: "notes" as const,
  entity_id: id,
  client_time: "2026-06-01T07:30:00.000Z",
  season_id: null,
  payload: { body: `note ${id}` },
});

test("settle drops only what the server accepted, and keeps writes added mid-flush", () => {
  store.clear();
  enqueue(note("a"));
  enqueue(note("b"));

  // The flush sent a and b; c was captured while it was in flight.
  const inFlight = readQueue().map((op) => op.entity_id);
  enqueue(note("c"));

  assert.deepEqual(inFlight, ["a", "b"]);
  assert.deepEqual(
    settle(["a"]).map((op) => op.entity_id),
    ["b", "c"],
  );
  assert.deepEqual(
    settle(["b", "c"]).map((op) => op.entity_id),
    [],
  );
});

test("a corrupt outbox reads as empty rather than throwing mid-pick", () => {
  store.set("plaashek.field.outbox", "{not json");
  assert.deepEqual(readQueue(), []);
});

test("an app upgrade migrates a pre-versioning outbox without losing pending writes", () => {
  store.clear();
  // v0 shape, from before schema versioning existed: a bare array, no wrapper.
  store.set("plaashek.field.outbox", JSON.stringify([note("a"), note("b")]));

  assert.deepEqual(
    readQueue().map((op) => op.entity_id),
    ["a", "b"],
  );

  // Migration must not just read through — it has to persist the upgrade,
  // and a capture made right after must land alongside the migrated ops.
  enqueue(note("c"));
  assert.deepEqual(
    readQueue().map((op) => op.entity_id),
    ["a", "b", "c"],
  );
  assert.deepEqual(
    settle(["a", "b", "c"]).map((op) => op.entity_id),
    [],
  );
});
