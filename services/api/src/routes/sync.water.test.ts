import assert from "node:assert/strict";
import test from "node:test";
import { meterReadings, waterPoints } from "@plaashek/schema";
import { eq } from "drizzle-orm";
import { buildTestApp } from "../test/app.js";
import { withTestDb } from "../test/db.js";
import { pairedPhone, ticketFor } from "../test/fixtures.js";

function reading(pointId: string, value: number, extra: Record<string, unknown> = {}) {
  return {
    entity: "meter_readings",
    entity_id: crypto.randomUUID(),
    client_time: "2026-06-01T04:12:00.000Z",
    season_id: null,
    payload: { water_point_id: pointId, reading: value, ...extra },
  };
}

test("a reading uploads, stamped with the value and the device's assigned person, season always null", async () => {
  await withTestDb(async (db) => {
    const { app, deps } = await buildTestApp(db);
    const { farm, person, device } = await pairedPhone(db, "water");
    const [point] = await db.insert(waterPoints).values({ farmId: farm.id, name: "Boorgat 1", unit: "m³" }).returning();
    const ticket = await ticketFor(deps, farm, device, ["water"]);

    const response = await app.inject({
      method: "POST",
      url: "/sync/upload",
      headers: { authorization: `Bearer ${ticket}` },
      payload: { ops: [reading(point.id, 1200, { note: "Maandelikse lesing" })] },
    });

    assert.equal(response.statusCode, 200);
    assert.equal(response.json().held, false);

    const [row] = await db.select().from(meterReadings).where(eq(meterReadings.farmId, farm.id));
    assert.equal(row.createdBy, person.id);
    assert.equal(row.moduleCode, "water");
    assert.equal(row.waterPointId, point.id);
    assert.equal(row.reading, 1200);
    assert.equal(row.seasonId, null);
    assert.equal(row.note, "Maandelikse lesing");
  });
});

test("the same reading uploaded twice lands once", async () => {
  await withTestDb(async (db) => {
    const { app, deps } = await buildTestApp(db);
    const { farm, device } = await pairedPhone(db, "water");
    const [point] = await db.insert(waterPoints).values({ farmId: farm.id, name: "Boorgat 1", unit: "m³" }).returning();
    const ticket = await ticketFor(deps, farm, device, ["water"]);

    const op = reading(point.id, 1200);
    for (const _ of [1, 2]) {
      const response = await app.inject({
        method: "POST",
        url: "/sync/upload",
        headers: { authorization: `Bearer ${ticket}` },
        payload: { ops: [op] },
      });
      assert.equal(response.statusCode, 200);
    }

    assert.equal((await db.select().from(meterReadings).where(eq(meterReadings.farmId, farm.id))).length, 1);
  });
});

test("a device paired for stoor cannot upload a reading", async () => {
  await withTestDb(async (db) => {
    const { app, deps } = await buildTestApp(db);
    const { farm, device } = await pairedPhone(db, "stoor");
    const [point] = await db.insert(waterPoints).values({ farmId: farm.id, name: "Boorgat 1", unit: "m³" }).returning();
    const ticket = await ticketFor(deps, farm, device, ["stoor"]);

    const response = await app.inject({
      method: "POST",
      url: "/sync/upload",
      headers: { authorization: `Bearer ${ticket}` },
      payload: { ops: [reading(point.id, 1200)] },
    });

    assert.equal(response.statusCode, 403);
    assert.equal(response.json().error.code, "not_paired");
  });
});

test("a suspended Water licence holds the reading instead of dropping it", async () => {
  await withTestDb(async (db) => {
    const { app, deps } = await buildTestApp(db);
    const { farm, device } = await pairedPhone(db, "water", "suspended");
    const [point] = await db.insert(waterPoints).values({ farmId: farm.id, name: "Boorgat 1", unit: "m³" }).returning();
    const ticket = await ticketFor(deps, farm, device, ["water"], { farmModules: [] });

    const response = await app.inject({
      method: "POST",
      url: "/sync/upload",
      headers: { authorization: `Bearer ${ticket}` },
      payload: { ops: [reading(point.id, 1200)] },
    });

    assert.equal(response.statusCode, 200);
    assert.equal(response.json().held, true);
    assert.equal((await db.select().from(meterReadings).where(eq(meterReadings.farmId, farm.id))).length, 0);
  });
});
