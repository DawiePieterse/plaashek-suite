import assert from "node:assert/strict";
import test from "node:test";
import { assets, fuelLogs, workOrders } from "@plaashek/schema";
import { asc, eq } from "drizzle-orm";
import { buildTestApp } from "../test/app.js";
import { withTestDb } from "../test/db.js";
import { pairedPhone, ticketFor } from "../test/fixtures.js";

function workOrderOp(assetId: string, event: "opened" | "closed", clientTime: string, description: string | null = null) {
  return {
    entity: "work_orders",
    entity_id: crypto.randomUUID(),
    client_time: clientTime,
    season_id: null,
    payload: { asset_id: assetId, event, description },
  };
}

function fuelLogOp(assetId: string, litres: number, extra: Record<string, unknown> = {}) {
  return {
    entity: "fuel_logs",
    entity_id: crypto.randomUUID(),
    client_time: "2026-06-01T04:12:00.000Z",
    season_id: null,
    payload: { asset_id: assetId, litres, ...extra },
  };
}

test("opening and closing a job uploads as two rows, season always null", async () => {
  await withTestDb(async (db) => {
    const { app, deps } = await buildTestApp(db);
    const { farm, person, device } = await pairedPhone(db, "werkswinkel");
    const [asset] = await db.insert(assets).values({ farmId: farm.id, name: "Trekker" }).returning();
    const ticket = await ticketFor(deps, farm, device, ["werkswinkel"]);

    const response = await app.inject({
      method: "POST",
      url: "/sync/upload",
      headers: { authorization: `Bearer ${ticket}` },
      payload: {
        ops: [
          workOrderOp(asset.id, "opened", "2026-06-01T04:00:00.000Z", "Band pap"),
          workOrderOp(asset.id, "closed", "2026-06-01T10:00:00.000Z", "Nuwe band"),
        ],
      },
    });

    assert.equal(response.statusCode, 200);
    assert.equal(response.json().held, false);

    const rows = await db.select().from(workOrders).where(eq(workOrders.farmId, farm.id)).orderBy(asc(workOrders.createdAt));
    assert.equal(rows.length, 2);
    assert.equal(rows[0].createdBy, person.id);
    assert.equal(rows[0].moduleCode, "werkswinkel");
    assert.equal(rows[0].seasonId, null);
    assert.deepEqual(rows.map((row) => [row.event, row.description]), [
      ["opened", "Band pap"],
      ["closed", "Nuwe band"],
    ]);
  });
});

test("a fuel log uploads, stamped with the asset and litres", async () => {
  await withTestDb(async (db) => {
    const { app, deps } = await buildTestApp(db);
    const { farm, person, device } = await pairedPhone(db, "werkswinkel");
    const [asset] = await db.insert(assets).values({ farmId: farm.id, name: "Trekker" }).returning();
    const ticket = await ticketFor(deps, farm, device, ["werkswinkel"]);

    const response = await app.inject({
      method: "POST",
      url: "/sync/upload",
      headers: { authorization: `Bearer ${ticket}` },
      payload: { ops: [fuelLogOp(asset.id, 45.5, { meter_reading: 12345 })] },
    });

    assert.equal(response.statusCode, 200);

    const [row] = await db.select().from(fuelLogs).where(eq(fuelLogs.farmId, farm.id));
    assert.equal(row.createdBy, person.id);
    assert.equal(row.litres, 45.5);
    assert.equal(row.meterReading, 12345);
    assert.equal(row.seasonId, null);
  });
});

test("the same work order event uploaded twice lands once", async () => {
  await withTestDb(async (db) => {
    const { app, deps } = await buildTestApp(db);
    const { farm, device } = await pairedPhone(db, "werkswinkel");
    const [asset] = await db.insert(assets).values({ farmId: farm.id, name: "Trekker" }).returning();
    const ticket = await ticketFor(deps, farm, device, ["werkswinkel"]);

    const op = workOrderOp(asset.id, "opened", "2026-06-01T04:00:00.000Z", "Band pap");
    for (const _ of [1, 2]) {
      const response = await app.inject({
        method: "POST",
        url: "/sync/upload",
        headers: { authorization: `Bearer ${ticket}` },
        payload: { ops: [op] },
      });
      assert.equal(response.statusCode, 200);
    }

    assert.equal((await db.select().from(workOrders).where(eq(workOrders.farmId, farm.id))).length, 1);
  });
});

test("a device paired for stoor cannot upload a work order or fuel log", async () => {
  await withTestDb(async (db) => {
    const { app, deps } = await buildTestApp(db);
    const { farm, device } = await pairedPhone(db, "stoor");
    const [asset] = await db.insert(assets).values({ farmId: farm.id, name: "Trekker" }).returning();
    const ticket = await ticketFor(deps, farm, device, ["stoor"]);

    const response = await app.inject({
      method: "POST",
      url: "/sync/upload",
      headers: { authorization: `Bearer ${ticket}` },
      payload: { ops: [workOrderOp(asset.id, "opened", "2026-06-01T04:00:00.000Z")] },
    });

    assert.equal(response.statusCode, 403);
    assert.equal(response.json().error.code, "not_paired");
  });
});

test("a suspended Werkswinkel licence holds both entities instead of dropping them", async () => {
  await withTestDb(async (db) => {
    const { app, deps } = await buildTestApp(db);
    const { farm, device } = await pairedPhone(db, "werkswinkel", "suspended");
    const [asset] = await db.insert(assets).values({ farmId: farm.id, name: "Trekker" }).returning();
    const ticket = await ticketFor(deps, farm, device, ["werkswinkel"], { farmModules: [] });

    const response = await app.inject({
      method: "POST",
      url: "/sync/upload",
      headers: { authorization: `Bearer ${ticket}` },
      payload: { ops: [workOrderOp(asset.id, "opened", "2026-06-01T04:00:00.000Z"), fuelLogOp(asset.id, 10)] },
    });

    assert.equal(response.statusCode, 200);
    assert.equal(response.json().held, true);
    assert.equal((await db.select().from(workOrders).where(eq(workOrders.farmId, farm.id))).length, 0);
    assert.equal((await db.select().from(fuelLogs).where(eq(fuelLogs.farmId, farm.id))).length, 0);
  });
});
