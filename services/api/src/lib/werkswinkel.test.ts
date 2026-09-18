import assert from "node:assert/strict";
import test from "node:test";
import { openWorkOrders, type WorkOrderEvent } from "./werkswinkel.js";

function event(kind: "opened" | "closed", at: string, description: string | null = null, assetId = "trekker", assetName = "Trekker"): WorkOrderEvent {
  return { assetId, assetName, event: kind, description, at: new Date(at) };
}

test("an opened job with no close is open", () => {
  const open = openWorkOrders([event("opened", "2026-06-01T04:00:00Z", "Enjin wil nie vat nie")]);

  assert.equal(open.length, 1);
  assert.equal(open[0].description, "Enjin wil nie vat nie");
});

test("closing pairs off the open job", () => {
  const open = openWorkOrders([event("opened", "2026-06-01T04:00:00Z"), event("closed", "2026-06-02T04:00:00Z")]);

  assert.deepEqual(open, []);
});

test("a closed event with nothing open is ignored rather than guessed at", () => {
  const open = openWorkOrders([event("closed", "2026-06-01T04:00:00Z")]);

  assert.deepEqual(open, []);
});

test("two faults reported before either is fixed both stay open", () => {
  const open = openWorkOrders([
    event("opened", "2026-06-01T04:00:00Z", "Band pap"),
    event("opened", "2026-06-01T05:00:00Z", "Rem lig werk nie"),
  ]);

  assert.equal(open.length, 2);
});

test("a close pairs FIFO against the oldest open job on the asset", () => {
  const open = openWorkOrders([
    event("opened", "2026-06-01T04:00:00Z", "Band pap"),
    event("opened", "2026-06-01T05:00:00Z", "Rem lig werk nie"),
    event("closed", "2026-06-02T04:00:00Z"),
  ]);

  assert.equal(open.length, 1);
  assert.equal(open[0].description, "Rem lig werk nie");
});

test("out-of-order arrival still pairs — a phone syncs a whole day at the gate", () => {
  const open = openWorkOrders([event("closed", "2026-06-02T04:00:00Z"), event("opened", "2026-06-01T04:00:00Z")]);

  assert.deepEqual(open, []);
});

test("keeps jobs on different assets separate", () => {
  const open = openWorkOrders([
    event("opened", "2026-06-01T04:00:00Z", "Band pap", "trekker", "Trekker"),
    event("opened", "2026-06-01T04:00:00Z", "Pomp lek", "pomp", "Waterpomp"),
    event("closed", "2026-06-02T04:00:00Z", null, "trekker", "Trekker"),
  ]);

  assert.equal(open.length, 1);
  assert.equal(open[0].assetName, "Waterpomp");
});
