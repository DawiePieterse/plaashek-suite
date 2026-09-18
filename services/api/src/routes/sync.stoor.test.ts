import assert from "node:assert/strict";
import test from "node:test";
import { stockItems, stockMoves } from "@plaashek/schema";
import { eq } from "drizzle-orm";
import { buildTestApp } from "../test/app.js";
import { withTestDb } from "../test/db.js";
import { pairedPhone, ticketFor } from "../test/fixtures.js";

function move(itemId: string, direction: "in" | "out", quantity: number, extra: Record<string, unknown> = {}) {
  return {
    entity: "stock_moves",
    entity_id: crypto.randomUUID(),
    client_time: "2026-06-01T04:12:00.000Z",
    season_id: null,
    payload: { item_id: itemId, direction, quantity, ...extra },
  };
}

test("a stock move uploads, stamped with the direction, quantity and the device's assigned person", async () => {
  await withTestDb(async (db) => {
    const { app, deps } = await buildTestApp(db);
    const { farm, person, device } = await pairedPhone(db, "stoor");
    const [item] = await db.insert(stockItems).values({ farmId: farm.id, name: "Glifosaat", unit: "L" }).returning();
    const ticket = await ticketFor(deps, farm, device, ["stoor"]);

    const response = await app.inject({
      method: "POST",
      url: "/sync/upload",
      headers: { authorization: `Bearer ${ticket}` },
      payload: { ops: [move(item.id, "in", 20), move(item.id, "out", 5, { note: "Blok A" })] },
    });

    assert.equal(response.statusCode, 200);
    assert.equal(response.json().held, false);

    const rows = await db.select().from(stockMoves).where(eq(stockMoves.farmId, farm.id));
    assert.equal(rows.length, 2);
    assert.equal(rows[0].createdBy, person.id);
    assert.equal(rows[0].moduleCode, "stoor");
    assert.equal(rows[0].itemId, item.id);
    assert.equal(rows.find((row) => row.direction === "out")?.note, "Blok A");
  });
});

test("the same move uploaded twice lands once", async () => {
  await withTestDb(async (db) => {
    const { app, deps } = await buildTestApp(db);
    const { farm, device } = await pairedPhone(db, "stoor");
    const [item] = await db.insert(stockItems).values({ farmId: farm.id, name: "Glifosaat", unit: "L" }).returning();
    const ticket = await ticketFor(deps, farm, device, ["stoor"]);

    const op = move(item.id, "in", 10);
    for (const _ of [1, 2]) {
      const response = await app.inject({
        method: "POST",
        url: "/sync/upload",
        headers: { authorization: `Bearer ${ticket}` },
        payload: { ops: [op] },
      });
      assert.equal(response.statusCode, 200);
    }

    assert.equal((await db.select().from(stockMoves).where(eq(stockMoves.farmId, farm.id))).length, 1);
  });
});

test("a device paired for span cannot upload a stock move", async () => {
  await withTestDb(async (db) => {
    const { app, deps } = await buildTestApp(db);
    const { farm, device } = await pairedPhone(db, "span");
    const [item] = await db.insert(stockItems).values({ farmId: farm.id, name: "Glifosaat", unit: "L" }).returning();
    const ticket = await ticketFor(deps, farm, device, ["span"]);

    const response = await app.inject({
      method: "POST",
      url: "/sync/upload",
      headers: { authorization: `Bearer ${ticket}` },
      payload: { ops: [move(item.id, "in", 10)] },
    });

    assert.equal(response.statusCode, 403);
    assert.equal(response.json().error.code, "not_paired");
  });
});

test("a suspended Stoor licence holds the move instead of dropping it", async () => {
  await withTestDb(async (db) => {
    const { app, deps } = await buildTestApp(db);
    const { farm, device } = await pairedPhone(db, "stoor", "suspended");
    const [item] = await db.insert(stockItems).values({ farmId: farm.id, name: "Glifosaat", unit: "L" }).returning();
    const ticket = await ticketFor(deps, farm, device, ["stoor"], { farmModules: [] });

    const response = await app.inject({
      method: "POST",
      url: "/sync/upload",
      headers: { authorization: `Bearer ${ticket}` },
      payload: { ops: [move(item.id, "out", 3)] },
    });

    assert.equal(response.statusCode, 200);
    assert.equal(response.json().held, true);
    assert.equal((await db.select().from(stockMoves).where(eq(stockMoves.farmId, farm.id))).length, 0);
  });
});
