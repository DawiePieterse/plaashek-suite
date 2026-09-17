import assert from "node:assert/strict";
import test from "node:test";
import { attendancePunches, deviceAssignments, deviceModules, devices, entitlements } from "@plaashek/schema";
import { mintTicket } from "@plaashek/tickets";
import { asc, eq } from "drizzle-orm";
import type { Db } from "../db.js";
import { buildTestApp } from "../test/app.js";
import { withTestDb } from "../test/db.js";
import { seedFarm } from "../test/fixtures.js";

/** A paired Span phone, assigned to the one person it clocks (ADR 0008). */
async function pairedSpanPhone(db: Db, status: "active" | "suspended" = "active") {
  const { farm, person, membership } = await seedFarm(db);
  await db.insert(entitlements).values({ farmId: farm.id, moduleCode: "span", status });

  const [device] = await db.insert(devices).values({ farmId: farm.id, label: "Anna se foon" }).returning();
  await db.insert(deviceModules).values({ deviceId: device.id, moduleCode: "span" });
  await db
    .insert(deviceAssignments)
    .values({ deviceId: device.id, personId: person.id, assignedBy: membership.id, assignedAt: new Date("2026-01-01T00:00:00Z") });

  return { farm, person, device };
}

function punch(direction: "in" | "out", clientTime: string) {
  return {
    entity: "attendance_punches",
    entity_id: crypto.randomUUID(),
    client_time: clientTime,
    season_id: null,
    payload: { direction, latitude: -25.75, longitude: 28.23, location_accuracy_m: 12 },
  };
}

test("a punch uploads, stamped with the direction and the device's assigned person", async () => {
  await withTestDb(async (db) => {
    const { app, deps } = await buildTestApp(db);
    const { farm, person, device } = await pairedSpanPhone(db);
    const ticket = await mintTicket({
      farmId: farm.id,
      deviceId: device.id,
      farmModules: ["span"],
      deviceModules: ["span"],
      language: "af",
      seasonId: null,
      signingKey: deps.keys.privateKey,
    });

    const response = await app.inject({
      method: "POST",
      url: "/sync/upload",
      headers: { authorization: `Bearer ${ticket}` },
      payload: { ops: [punch("in", "2026-06-01T04:12:00.000Z"), punch("out", "2026-06-01T14:03:00.000Z")] },
    });

    assert.equal(response.statusCode, 200);
    assert.equal(response.json().held, false);

    const rows = await db
      .select()
      .from(attendancePunches)
      .where(eq(attendancePunches.farmId, farm.id))
      .orderBy(asc(attendancePunches.createdAt));

    assert.deepEqual(
      rows.map((row) => row.direction),
      ["in", "out"],
    );
    assert.equal(rows[0].createdBy, person.id);
    assert.equal(rows[0].moduleCode, "span");
    assert.equal(rows[0].latitude, -25.75);
    // The punch's own time, not when it finally reached signal (plan §7).
    assert.equal(rows[0].createdAt.toISOString(), "2026-06-01T04:12:00.000Z");
  });
});

test("a second `in` is accepted rather than argued with", async () => {
  await withTestDb(async (db) => {
    const { app, deps } = await buildTestApp(db);
    const { farm, device } = await pairedSpanPhone(db);
    const ticket = await mintTicket({
      farmId: farm.id,
      deviceId: device.id,
      farmModules: ["span"],
      deviceModules: ["span"],
      language: "af",
      seasonId: null,
      signingKey: deps.keys.privateKey,
    });

    const response = await app.inject({
      method: "POST",
      url: "/sync/upload",
      headers: { authorization: `Bearer ${ticket}` },
      payload: { ops: [punch("in", "2026-06-01T04:12:00.000Z"), punch("in", "2026-06-01T04:13:00.000Z")] },
    });

    assert.equal(response.statusCode, 200);
    assert.equal((await db.select().from(attendancePunches).where(eq(attendancePunches.farmId, farm.id))).length, 2);
  });
});

test("the same punch uploaded twice lands once", async () => {
  await withTestDb(async (db) => {
    const { app, deps } = await buildTestApp(db);
    const { farm, device } = await pairedSpanPhone(db);
    const ticket = await mintTicket({
      farmId: farm.id,
      deviceId: device.id,
      farmModules: ["span"],
      deviceModules: ["span"],
      language: "af",
      seasonId: null,
      signingKey: deps.keys.privateKey,
    });

    const op = punch("in", "2026-06-01T04:12:00.000Z");
    for (const _ of [1, 2]) {
      const response = await app.inject({
        method: "POST",
        url: "/sync/upload",
        headers: { authorization: `Bearer ${ticket}` },
        payload: { ops: [op] },
      });
      assert.equal(response.statusCode, 200);
    }

    assert.equal((await db.select().from(attendancePunches).where(eq(attendancePunches.farmId, farm.id))).length, 1);
  });
});

test("a device paired for boord cannot upload a punch", async () => {
  await withTestDb(async (db) => {
    const { app, deps } = await buildTestApp(db);
    const { farm, person, membership } = await seedFarm(db);
    await db.insert(entitlements).values({ farmId: farm.id, moduleCode: "boord", status: "active" });
    const [device] = await db.insert(devices).values({ farmId: farm.id }).returning();
    await db.insert(deviceModules).values({ deviceId: device.id, moduleCode: "boord" });
    await db.insert(deviceAssignments).values({ deviceId: device.id, personId: person.id, assignedBy: membership.id });

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
      payload: { ops: [punch("in", "2026-06-01T04:12:00.000Z")] },
    });

    assert.equal(response.statusCode, 403);
    assert.equal(response.json().error.code, "not_paired");
  });
});

test("a suspended Span licence holds the punch instead of dropping it", async () => {
  await withTestDb(async (db) => {
    const { app, deps } = await buildTestApp(db);
    const { farm, device } = await pairedSpanPhone(db, "suspended");
    const ticket = await mintTicket({
      farmId: farm.id,
      deviceId: device.id,
      farmModules: [],
      deviceModules: ["span"],
      language: "af",
      seasonId: null,
      signingKey: deps.keys.privateKey,
    });

    const response = await app.inject({
      method: "POST",
      url: "/sync/upload",
      headers: { authorization: `Bearer ${ticket}` },
      payload: { ops: [punch("in", "2026-06-01T04:12:00.000Z")] },
    });

    assert.equal(response.statusCode, 200);
    assert.equal(response.json().held, true);
    assert.equal((await db.select().from(attendancePunches).where(eq(attendancePunches.farmId, farm.id))).length, 0);
  });
});
