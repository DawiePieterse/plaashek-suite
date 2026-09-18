import assert from "node:assert/strict";
import test from "node:test";
import { assets, fuelLogs, workOrders } from "@plaashek/schema";
import { eq } from "drizzle-orm";
import type { Db } from "../db.js";
import { buildTestApp } from "../test/app.js";
import { withTestDb } from "../test/db.js";
import { pairedPhone, ticketFor } from "../test/fixtures.js";

async function pairedWerkswinkelPhone(db: Db, status: "active" | "grace" | "suspended" | "cancelled" = "active") {
  const phone = await pairedPhone(db, "werkswinkel", status);
  const [asset] = await db.insert(assets).values({ farmId: phone.farm.id, name: "Trekker" }).returning();
  return { ...phone, asset };
}

test("a fuel log uploads, stamped with the asset and the assigned person", async () => {
  await withTestDb(async (db) => {
    const { app, deps } = await buildTestApp(db);
    const { farm, person, device, asset } = await pairedWerkswinkelPhone(db);
    const ticket = await ticketFor(deps, farm, device, ["werkswinkel"]);

    const response = await app.inject({
      method: "POST",
      url: "/sync/upload",
      headers: { authorization: `Bearer ${ticket}` },
      payload: {
        ops: [
          {
            entity: "fuel_logs",
            entity_id: crypto.randomUUID(),
            client_time: "2026-06-01T07:30:00.000Z",
            season_id: null,
            payload: { asset_id: asset.id, litres_used: 42.5, odometer_km: 10123 },
          },
        ],
      },
    });

    assert.equal(response.statusCode, 200);
    assert.equal(response.json().held, false);

    const [row] = await db.select().from(fuelLogs).where(eq(fuelLogs.farmId, farm.id));
    assert.equal(row.assetId, asset.id);
    assert.equal(row.litresUsed, 42.5);
    assert.equal(row.odometerKm, 10123);
    assert.equal(row.createdBy, person.id);
    assert.equal(row.moduleCode, "werkswinkel");
  });
});

test("a work order opens and closes — both statuses are always accepted", async () => {
  await withTestDb(async (db) => {
    const { app, deps } = await buildTestApp(db);
    const { farm, device, asset } = await pairedWerkswinkelPhone(db);
    const ticket = await ticketFor(deps, farm, device, ["werkswinkel"]);

    const response = await app.inject({
      method: "POST",
      url: "/sync/upload",
      headers: { authorization: `Bearer ${ticket}` },
      payload: {
        ops: [
          {
            entity: "work_orders",
            entity_id: crypto.randomUUID(),
            client_time: "2026-06-01T04:00:00.000Z",
            season_id: null,
            payload: { asset_id: asset.id, description: "Plat band", status: "open" },
          },
          {
            entity: "work_orders",
            entity_id: crypto.randomUUID(),
            client_time: "2026-06-01T10:00:00.000Z",
            season_id: null,
            payload: { asset_id: asset.id, description: "Band vervang", status: "closed" },
          },
        ],
      },
    });

    assert.equal(response.statusCode, 200);
    const rows = await db.select().from(workOrders).where(eq(workOrders.farmId, farm.id));
    assert.deepEqual(
      rows.map((r) => r.status).sort(),
      ["closed", "open"],
    );
  });
});

test("a device paired for boord cannot upload a fuel log or work order", async () => {
  await withTestDb(async (db) => {
    const { app, deps } = await buildTestApp(db);
    const { farm, device } = await pairedPhone(db, "boord");
    const [asset] = await db.insert(assets).values({ farmId: farm.id, name: "Trekker" }).returning();
    const ticket = await ticketFor(deps, farm, device, ["boord"]);

    const response = await app.inject({
      method: "POST",
      url: "/sync/upload",
      headers: { authorization: `Bearer ${ticket}` },
      payload: {
        ops: [{ entity: "fuel_logs", entity_id: crypto.randomUUID(), client_time: "2026-06-01T07:30:00.000Z", season_id: null, payload: { asset_id: asset.id, litres_used: 10 } }],
      },
    });

    assert.equal(response.statusCode, 403);
    assert.equal(response.json().error.code, "not_paired");
  });
});

test("a suspended Werkswinkel licence holds both fuel and work-order captures instead of dropping them", async () => {
  await withTestDb(async (db) => {
    const { app, deps } = await buildTestApp(db);
    const { farm, device, asset } = await pairedWerkswinkelPhone(db, "suspended");
    const ticket = await ticketFor(deps, farm, device, ["werkswinkel"], { farmModules: [] });

    const response = await app.inject({
      method: "POST",
      url: "/sync/upload",
      headers: { authorization: `Bearer ${ticket}` },
      payload: {
        ops: [
          { entity: "fuel_logs", entity_id: crypto.randomUUID(), client_time: "2026-06-01T07:30:00.000Z", season_id: null, payload: { asset_id: asset.id, litres_used: 10 } },
          { entity: "work_orders", entity_id: crypto.randomUUID(), client_time: "2026-06-01T07:30:00.000Z", season_id: null, payload: { asset_id: asset.id, description: "Iets", status: "open" } },
        ],
      },
    });

    assert.equal(response.statusCode, 200);
    assert.equal(response.json().held, true);
    assert.equal((await db.select().from(fuelLogs).where(eq(fuelLogs.farmId, farm.id))).length, 0);
    assert.equal((await db.select().from(workOrders).where(eq(workOrders.farmId, farm.id))).length, 0);
  });
});
