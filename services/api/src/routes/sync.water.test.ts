import assert from "node:assert/strict";
import test from "node:test";
import { assets, meterReadings } from "@plaashek/schema";
import { eq } from "drizzle-orm";
import type { Db } from "../db.js";
import { buildTestApp } from "../test/app.js";
import { withTestDb } from "../test/db.js";
import { pairedPhone, ticketFor } from "../test/fixtures.js";

async function pairedWaterPhone(db: Db, status: "active" | "grace" | "suspended" | "cancelled" = "active") {
  const phone = await pairedPhone(db, "water", status);
  const [asset] = await db.insert(assets).values({ farmId: phone.farm.id, name: "Boorgat 1" }).returning();
  return { ...phone, asset };
}

test("a meter reading uploads, stamped with the asset and the assigned person", async () => {
  await withTestDb(async (db) => {
    const { app, deps } = await buildTestApp(db);
    const { farm, person, device, asset } = await pairedWaterPhone(db);
    const ticket = await ticketFor(deps, farm, device, ["water"]);

    const response = await app.inject({
      method: "POST",
      url: "/sync/upload",
      headers: { authorization: `Bearer ${ticket}` },
      payload: {
        ops: [
          {
            entity: "meter_readings",
            entity_id: crypto.randomUUID(),
            client_time: "2026-06-01T07:30:00.000Z",
            season_id: null,
            payload: { asset_id: asset.id, reading: 1024.5, note: "laag" },
          },
        ],
      },
    });

    assert.equal(response.statusCode, 200);
    assert.equal(response.json().held, false);

    const [row] = await db.select().from(meterReadings).where(eq(meterReadings.farmId, farm.id));
    assert.equal(row.assetId, asset.id);
    assert.equal(row.reading, 1024.5);
    assert.equal(row.note, "laag");
    assert.equal(row.createdBy, person.id);
    assert.equal(row.moduleCode, "water");
    assert.equal(row.seasonId, null);
  });
});

test("a device paired for boord cannot upload a meter reading", async () => {
  await withTestDb(async (db) => {
    const { app, deps } = await buildTestApp(db);
    const { farm, device } = await pairedPhone(db, "boord");
    const [asset] = await db.insert(assets).values({ farmId: farm.id, name: "Boorgat 1" }).returning();
    const ticket = await ticketFor(deps, farm, device, ["boord"]);

    const response = await app.inject({
      method: "POST",
      url: "/sync/upload",
      headers: { authorization: `Bearer ${ticket}` },
      payload: {
        ops: [{ entity: "meter_readings", entity_id: crypto.randomUUID(), client_time: "2026-06-01T07:30:00.000Z", season_id: null, payload: { asset_id: asset.id, reading: 10 } }],
      },
    });

    assert.equal(response.statusCode, 403);
    assert.equal(response.json().error.code, "not_paired");
  });
});

test("a suspended Water licence holds the reading instead of dropping it", async () => {
  await withTestDb(async (db) => {
    const { app, deps } = await buildTestApp(db);
    const { farm, device, asset } = await pairedWaterPhone(db, "suspended");
    const ticket = await ticketFor(deps, farm, device, ["water"], { farmModules: [] });

    const response = await app.inject({
      method: "POST",
      url: "/sync/upload",
      headers: { authorization: `Bearer ${ticket}` },
      payload: {
        ops: [{ entity: "meter_readings", entity_id: crypto.randomUUID(), client_time: "2026-06-01T07:30:00.000Z", season_id: null, payload: { asset_id: asset.id, reading: 10 } }],
      },
    });

    assert.equal(response.statusCode, 200);
    assert.equal(response.json().held, true);
    assert.equal((await db.select().from(meterReadings).where(eq(meterReadings.farmId, farm.id))).length, 0);
  });
});

test("the same reading uploaded twice lands once", async () => {
  await withTestDb(async (db) => {
    const { app, deps } = await buildTestApp(db);
    const { farm, device, asset } = await pairedWaterPhone(db);
    const ticket = await ticketFor(deps, farm, device, ["water"]);

    const op = {
      entity: "meter_readings" as const,
      entity_id: crypto.randomUUID(),
      client_time: "2026-06-01T07:30:00.000Z",
      season_id: null,
      payload: { asset_id: asset.id, reading: 10 },
    };

    for (const _ of [1, 2]) {
      const response = await app.inject({ method: "POST", url: "/sync/upload", headers: { authorization: `Bearer ${ticket}` }, payload: { ops: [op] } });
      assert.equal(response.statusCode, 200);
    }

    assert.equal((await db.select().from(meterReadings).where(eq(meterReadings.farmId, farm.id))).length, 1);
  });
});
