import assert from "node:assert/strict";
import test from "node:test";
import { attendancePunches } from "@plaashek/schema";
import { asc, eq } from "drizzle-orm";
import { buildTestApp } from "../test/app.js";
import { withTestDb } from "../test/db.js";
import { pairedPhone, ticketFor } from "../test/fixtures.js";

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
    const { farm, person, device } = await pairedPhone(db, "span");
    const ticket = await ticketFor(deps, farm, device, ["span"]);

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
    const { farm, device } = await pairedPhone(db, "span");
    const ticket = await ticketFor(deps, farm, device, ["span"]);

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
    const { farm, device } = await pairedPhone(db, "span");
    const ticket = await ticketFor(deps, farm, device, ["span"]);

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
    const { farm, device } = await pairedPhone(db, "boord");
    const ticket = await ticketFor(deps, farm, device, ["boord"]);

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
    const { farm, device } = await pairedPhone(db, "span", "suspended");
    const ticket = await ticketFor(deps, farm, device, ["span"], { farmModules: [] });

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
