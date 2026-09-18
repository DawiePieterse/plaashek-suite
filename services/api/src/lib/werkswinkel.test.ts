import assert from "node:assert/strict";
import test from "node:test";
import { fuelByAsset, openWorkOrders, type FuelFill, type WorkOrderEvent } from "./werkswinkel.js";

function event(assetId: string, assetName: string, status: string, at: string, description = "Iets is stukkend"): WorkOrderEvent {
  return { assetId, assetName, personName: "Piet Plaas", description, status, at: new Date(at) };
}

test("an asset whose latest event is open is reported outstanding", () => {
  const [order] = openWorkOrders([event("t1", "Trekker", "open", "2026-06-01T04:00:00Z", "Plat band")]);

  assert.equal(order.assetName, "Trekker");
  assert.equal(order.description, "Plat band");
  assert.equal(order.openedBy, "Piet Plaas");
});

test("an asset whose latest event is closed has nothing outstanding", () => {
  const orders = openWorkOrders([
    event("t1", "Trekker", "open", "2026-06-01T04:00:00Z"),
    event("t1", "Trekker", "closed", "2026-06-01T10:00:00Z"),
  ]);

  assert.equal(orders.length, 0);
});

test("a second open after a close is outstanding again — no matching of specific rows", () => {
  const orders = openWorkOrders([
    event("t1", "Trekker", "open", "2026-06-01T04:00:00Z"),
    event("t1", "Trekker", "closed", "2026-06-01T10:00:00Z"),
    event("t1", "Trekker", "open", "2026-06-02T04:00:00Z", "Ander band nou plat"),
  ]);

  assert.equal(orders.length, 1);
  assert.equal(orders[0].description, "Ander band nou plat");
});

test("events need not arrive in time order — a phone can sync a whole day at once", () => {
  const orders = openWorkOrders([
    event("t1", "Trekker", "closed", "2026-06-01T10:00:00Z"),
    event("t1", "Trekker", "open", "2026-06-01T04:00:00Z"),
  ]);

  assert.equal(orders.length, 0);
});

test("groups per asset, sorted by name", () => {
  const orders = openWorkOrders([
    event("b", "Pomp B", "open", "2026-06-01T04:00:00Z"),
    event("a", "Trekker A", "open", "2026-06-01T04:00:00Z"),
  ]);

  assert.deepEqual(
    orders.map((o) => o.assetName),
    ["Pomp B", "Trekker A"],
  );
});

function fill(assetId: string, assetName: string, litresUsed: number): FuelFill {
  return { assetId, assetName, litresUsed };
}

test("sums litres per asset across multiple fills", () => {
  const [trekker] = fuelByAsset([fill("t1", "Trekker", 40), fill("t1", "Trekker", 35.5)]);

  assert.equal(trekker.litresUsed, 75.5);
  assert.equal(trekker.fills, 2);
});

test("fuel groups per asset, sorted by name", () => {
  const rows = fuelByAsset([fill("b", "Pomp B", 10), fill("a", "Trekker A", 40)]);

  assert.deepEqual(
    rows.map((r) => r.assetName),
    ["Pomp B", "Trekker A"],
  );
});
