import assert from "node:assert/strict";
import test from "node:test";
import { blocks, meterReadings, sprayApplications, stockItems, stockMoves, waterPoints } from "@plaashek/schema";
import { eq } from "drizzle-orm";
import { buildTestApp } from "../test/app.js";
import { withTestDb } from "../test/db.js";
import { pairedPhone, ticketFor } from "../test/fixtures.js";

function application(blockId: string, itemId: string, quantity: number, extra: Record<string, unknown> = {}) {
  return {
    entity: "spray_applications",
    entity_id: crypto.randomUUID(),
    client_time: "2026-06-01T04:12:00.000Z",
    season_id: null,
    payload: { block_id: blockId, item_id: itemId, quantity, ...extra },
  };
}

test("a foliar spray uploads, stamped with the device's assigned person, and books a matching Stoor stock-out", async () => {
  await withTestDb(async (db) => {
    const { app, deps } = await buildTestApp(db);
    const { farm, person, device } = await pairedPhone(db, "bespuiting");
    const [block] = await db.insert(blocks).values({ farmId: farm.id, name: "Blok 18" }).returning();
    const [item] = await db.insert(stockItems).values({ farmId: farm.id, name: "Springbok", unit: "L" }).returning();
    const ticket = await ticketFor(deps, farm, device, ["bespuiting"]);

    const response = await app.inject({
      method: "POST",
      url: "/sync/upload",
      headers: { authorization: `Bearer ${ticket}` },
      payload: { ops: [application(block.id, item.id, 18, { concentration: "500ml/100L", reason: "Onkruidbeheer" })] },
    });

    assert.equal(response.statusCode, 200);
    assert.equal(response.json().held, false);

    const [captured] = await db.select().from(sprayApplications).where(eq(sprayApplications.farmId, farm.id));
    assert.equal(captured.createdBy, person.id);
    assert.equal(captured.moduleCode, "bespuiting");
    assert.equal(captured.blockId, block.id);
    assert.equal(captured.itemId, item.id);
    assert.equal(captured.quantity, 18);
    assert.equal(captured.reason, "Onkruidbeheer");
    assert.equal(captured.waterPointId, null);

    // A foliar spray is a stock-out too, so Stoor's own on-hand total needs no separate entry.
    const [move] = await db.select().from(stockMoves).where(eq(stockMoves.farmId, farm.id));
    assert.equal(move.direction, "out");
    assert.equal(move.itemId, item.id);
    assert.equal(move.blockId, block.id);
    assert.equal(move.quantity, 18);
    assert.equal(move.createdBy, person.id);

    // No Kraan on this capture, so no reading should have been booked.
    assert.equal((await db.select().from(meterReadings).where(eq(meterReadings.farmId, farm.id))).length, 0);
  });
});

test("a fertigation run through a Kraan also books a season-less Water reading", async () => {
  await withTestDb(async (db) => {
    const { app, deps } = await buildTestApp(db);
    const { farm, device } = await pairedPhone(db, "bespuiting");
    const [block] = await db.insert(blocks).values({ farmId: farm.id, name: "Blok 18" }).returning();
    const [item] = await db.insert(stockItems).values({ farmId: farm.id, name: "Ca NO3", unit: "kg" }).returning();
    const [point] = await db.insert(waterPoints).values({ farmId: farm.id, name: "Kraan 18", unit: "L" }).returning();
    const ticket = await ticketFor(deps, farm, device, ["bespuiting"], { seasonId: crypto.randomUUID() });

    const response = await app.inject({
      method: "POST",
      url: "/sync/upload",
      headers: { authorization: `Bearer ${ticket}` },
      payload: { ops: [application(block.id, item.id, 28.9, { water_point_id: point.id, meter_reading: 5500 })] },
    });

    assert.equal(response.statusCode, 200);

    const [reading] = await db.select().from(meterReadings).where(eq(meterReadings.farmId, farm.id));
    assert.equal(reading.waterPointId, point.id);
    assert.equal(reading.reading, 5500);
    // Water is season-less even though this capture's own application is season-stamped.
    assert.equal(reading.seasonId, null);
  });
});

test("the same application uploaded twice books each table once", async () => {
  await withTestDb(async (db) => {
    const { app, deps } = await buildTestApp(db);
    const { farm, device } = await pairedPhone(db, "bespuiting");
    const [block] = await db.insert(blocks).values({ farmId: farm.id, name: "Blok 18" }).returning();
    const [item] = await db.insert(stockItems).values({ farmId: farm.id, name: "Springbok", unit: "L" }).returning();
    const [point] = await db.insert(waterPoints).values({ farmId: farm.id, name: "Kraan 18", unit: "L" }).returning();
    const ticket = await ticketFor(deps, farm, device, ["bespuiting"]);

    const op = application(block.id, item.id, 18, { water_point_id: point.id, meter_reading: 100 });
    for (const _ of [1, 2]) {
      const response = await app.inject({
        method: "POST",
        url: "/sync/upload",
        headers: { authorization: `Bearer ${ticket}` },
        payload: { ops: [op] },
      });
      assert.equal(response.statusCode, 200);
    }

    assert.equal((await db.select().from(sprayApplications).where(eq(sprayApplications.farmId, farm.id))).length, 1);
    assert.equal((await db.select().from(stockMoves).where(eq(stockMoves.farmId, farm.id))).length, 1);
    assert.equal((await db.select().from(meterReadings).where(eq(meterReadings.farmId, farm.id))).length, 1);
  });
});

test("a device paired for stoor cannot upload an application", async () => {
  await withTestDb(async (db) => {
    const { app, deps } = await buildTestApp(db);
    const { farm, device } = await pairedPhone(db, "stoor");
    const [block] = await db.insert(blocks).values({ farmId: farm.id, name: "Blok 18" }).returning();
    const [item] = await db.insert(stockItems).values({ farmId: farm.id, name: "Springbok", unit: "L" }).returning();
    const ticket = await ticketFor(deps, farm, device, ["stoor"]);

    const response = await app.inject({
      method: "POST",
      url: "/sync/upload",
      headers: { authorization: `Bearer ${ticket}` },
      payload: { ops: [application(block.id, item.id, 18)] },
    });

    assert.equal(response.statusCode, 403);
    assert.equal(response.json().error.code, "not_paired");
  });
});

test("a suspended Bespuiting licence holds the application and books nothing in Stoor or Water", async () => {
  await withTestDb(async (db) => {
    const { app, deps } = await buildTestApp(db);
    const { farm, device } = await pairedPhone(db, "bespuiting", "suspended");
    const [block] = await db.insert(blocks).values({ farmId: farm.id, name: "Blok 18" }).returning();
    const [item] = await db.insert(stockItems).values({ farmId: farm.id, name: "Springbok", unit: "L" }).returning();
    const ticket = await ticketFor(deps, farm, device, ["bespuiting"], { farmModules: [] });

    const response = await app.inject({
      method: "POST",
      url: "/sync/upload",
      headers: { authorization: `Bearer ${ticket}` },
      payload: { ops: [application(block.id, item.id, 18)] },
    });

    assert.equal(response.statusCode, 200);
    assert.equal(response.json().held, true);
    assert.equal((await db.select().from(sprayApplications).where(eq(sprayApplications.farmId, farm.id))).length, 0);
    assert.equal((await db.select().from(stockMoves).where(eq(stockMoves.farmId, farm.id))).length, 0);
  });
});
