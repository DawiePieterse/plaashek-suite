import assert from "node:assert/strict";
import test from "node:test";
import { blocks, deviceAssignments, deviceModules, devices, entitlements, harvestEvents } from "@plaashek/schema";
import { mintTicket } from "@plaashek/tickets";
import { eq } from "drizzle-orm";
import type { Db } from "../db.js";
import { buildTestApp } from "../test/app.js";
import { withTestDb } from "../test/db.js";
import { seedFarm } from "../test/fixtures.js";

/** A paired Boord phone, assigned to one person, with a block to capture against. */
async function pairedBoordPhone(db: Db) {
  const { farm, person, membership } = await seedFarm(db);
  await db.insert(entitlements).values({ farmId: farm.id, moduleCode: "boord", status: "active" });
  const [block] = await db.insert(blocks).values({ farmId: farm.id, name: "Blok A" }).returning();

  const [device] = await db.insert(devices).values({ farmId: farm.id, label: "Toetsfoon" }).returning();
  await db.insert(deviceModules).values({ deviceId: device.id, moduleCode: "boord" });
  await db
    .insert(deviceAssignments)
    .values({ deviceId: device.id, personId: person.id, assignedBy: membership.id, assignedAt: new Date("2026-01-01T00:00:00Z") });

  return { farm, person, device, block };
}

test("a harvest capture uploads, stamped with block, weight and the assigned person", async () => {
  await withTestDb(async (db) => {
    const { app, deps } = await buildTestApp(db);
    const { farm, person, device, block } = await pairedBoordPhone(db);
    const ticket = await mintTicket({
      farmId: farm.id,
      deviceId: device.id,
      farmModules: ["boord"],
      deviceModules: ["boord"],
      language: "af",
      seasonId: null,
      signingKey: deps.keys.privateKey,
    });

    const response = await app.inject({
      method: "POST",
      url: "/sync/upload",
      headers: { authorization: `Bearer ${ticket}` },
      payload: {
        ops: [
          {
            entity: "harvest_events",
            entity_id: crypto.randomUUID(),
            client_time: "2026-06-01T07:30:00.000Z",
            season_id: null,
            payload: { block_id: block.id, weight_kg: 18.5, deduction_kg: 0.5, weather_temp: 21, weather_humidity: 60, weather_condition: "Clear" },
          },
        ],
      },
    });

    assert.equal(response.statusCode, 200);
    assert.equal(response.json().held, false);

    const [row] = await db.select().from(harvestEvents).where(eq(harvestEvents.farmId, farm.id));
    assert.equal(row.blockId, block.id);
    assert.equal(row.weightKg, 18.5);
    assert.equal(row.deductionKg, 0.5);
    assert.equal(row.createdBy, person.id);
    assert.equal(row.moduleCode, "boord");
  });
});

test("a device paired for veldnotas cannot upload a harvest event", async () => {
  await withTestDb(async (db) => {
    const { app, deps } = await buildTestApp(db);
    const { farm, person, membership } = await seedFarm(db);
    await db.insert(entitlements).values({ farmId: farm.id, moduleCode: "veldnotas", status: "active" });
    const [block] = await db.insert(blocks).values({ farmId: farm.id, name: "Blok A" }).returning();
    const [device] = await db.insert(devices).values({ farmId: farm.id }).returning();
    await db.insert(deviceModules).values({ deviceId: device.id, moduleCode: "veldnotas" });
    await db.insert(deviceAssignments).values({ deviceId: device.id, personId: person.id, assignedBy: membership.id });

    const ticket = await mintTicket({
      farmId: farm.id,
      deviceId: device.id,
      farmModules: ["veldnotas"],
      deviceModules: ["veldnotas"],
      language: "af",
      seasonId: null,
      signingKey: deps.keys.privateKey,
    });

    const response = await app.inject({
      method: "POST",
      url: "/sync/upload",
      headers: { authorization: `Bearer ${ticket}` },
      payload: {
        ops: [
          {
            entity: "harvest_events",
            entity_id: crypto.randomUUID(),
            client_time: "2026-06-01T07:30:00.000Z",
            season_id: null,
            payload: { block_id: block.id, weight_kg: 10 },
          },
        ],
      },
    });

    assert.equal(response.statusCode, 403);
    assert.equal(response.json().error.code, "not_paired");
  });
});

test("a suspended Boord licence holds the harvest capture instead of dropping it", async () => {
  await withTestDb(async (db) => {
    const { app, deps } = await buildTestApp(db);
    const { farm, person, membership } = await seedFarm(db);
    await db.insert(entitlements).values({ farmId: farm.id, moduleCode: "boord", status: "suspended" });
    const [block] = await db.insert(blocks).values({ farmId: farm.id, name: "Blok A" }).returning();
    const [device] = await db.insert(devices).values({ farmId: farm.id }).returning();
    await db.insert(deviceModules).values({ deviceId: device.id, moduleCode: "boord" });
    await db.insert(deviceAssignments).values({ deviceId: device.id, personId: person.id, assignedBy: membership.id });

    const ticket = await mintTicket({
      farmId: farm.id,
      deviceId: device.id,
      farmModules: [],
      deviceModules: ["boord"],
      language: "af",
      seasonId: null,
      signingKey: deps.keys.privateKey,
    });

    const response = await app.inject({
      method: "POST",
      url: "/sync/upload",
      headers: { authorization: `Bearer ${ticket}` },
      payload: {
        ops: [
          {
            entity: "harvest_events",
            entity_id: crypto.randomUUID(),
            client_time: "2026-06-01T07:30:00.000Z",
            season_id: null,
            payload: { block_id: block.id, weight_kg: 10 },
          },
        ],
      },
    });

    assert.equal(response.statusCode, 200);
    assert.equal(response.json().held, true);
    assert.equal((await db.select().from(harvestEvents).where(eq(harvestEvents.farmId, farm.id))).length, 0);
  });
});
