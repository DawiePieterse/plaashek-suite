import assert from "node:assert/strict";
import test from "node:test";
import { devices, meterReadings, waterPoints } from "@plaashek/schema";
import { signStaffSession } from "../auth/staff-jwt.js";
import { buildTestApp } from "../test/app.js";
import { withTestDb } from "../test/db.js";
import { pairedPhone, seedFarm, ticketFor } from "../test/fixtures.js";

test("admin can add a water point and edit it; owner can read but not create", async () => {
  await withTestDb(async (db) => {
    const { app, deps } = await buildTestApp(db);
    const { farm, membership } = await seedFarm(db);
    const adminToken = await signStaffSession({ farmMembershipId: membership.id, farmId: farm.id, role: "admin" }, deps.env.staffSessionSecret);
    const adminHeaders = { authorization: `Bearer ${adminToken}` };

    const created = await app.inject({ method: "POST", url: "/water-points", headers: adminHeaders, payload: { name: "Boorgat 1", unit: "m³" } });
    assert.equal(created.statusCode, 200);
    const pointId = created.json().point.id;

    const edited = await app.inject({ method: "PATCH", url: `/water-points/${pointId}`, headers: adminHeaders, payload: { active: false } });
    assert.equal(edited.statusCode, 200);
    assert.equal(edited.json().point.active, false);

    const ownerToken = await signStaffSession({ farmMembershipId: membership.id, farmId: farm.id, role: "owner" }, deps.env.staffSessionSecret);
    const list = await app.inject({ method: "GET", url: "/water-points", headers: { authorization: `Bearer ${ownerToken}` } });
    assert.equal(list.statusCode, 200);
    assert.equal(list.json().points[0].active, false);

    const ownerCreate = await app.inject({
      method: "POST",
      url: "/water-points",
      headers: { authorization: `Bearer ${ownerToken}` },
      payload: { name: "Dam Suid", unit: "m" },
    });
    assert.equal(ownerCreate.statusCode, 403);
  });
});

test("a farm cannot edit another farm's water point", async () => {
  await withTestDb(async (db) => {
    const { app, deps } = await buildTestApp(db);
    const mine = await seedFarm(db, { email: "mine@example.com" });
    const theirs = await seedFarm(db, { email: "theirs@example.com" });
    const [theirPoint] = await db.insert(waterPoints).values({ farmId: theirs.farm.id, name: "Hulle punt", unit: "m³" }).returning();

    const token = await signStaffSession({ farmMembershipId: mine.membership.id, farmId: mine.farm.id, role: "admin" }, deps.env.staffSessionSecret);
    const response = await app.inject({
      method: "PATCH",
      url: `/water-points/${theirPoint.id}`,
      headers: { authorization: `Bearer ${token}` },
      payload: { active: false },
    });

    assert.equal(response.statusCode, 404);
  });
});

test("GET /water-catalog gives a paired phone only the active points", async () => {
  await withTestDb(async (db) => {
    const { app, deps } = await buildTestApp(db);
    const { farm, device } = await pairedPhone(db, "water");
    await db.insert(waterPoints).values([
      { farmId: farm.id, name: "Boorgat 1", unit: "m³", active: true },
      { farmId: farm.id, name: "Ou dam", unit: "m", active: false },
    ]);
    const ticket = await ticketFor(deps, farm, device, ["water"]);

    const response = await app.inject({ method: "GET", url: "/water-catalog", headers: { authorization: `Bearer ${ticket}` } });

    assert.equal(response.statusCode, 200);
    assert.deepEqual(
      response.json().points.map((point: { name: string }) => point.name),
      ["Boorgat 1"],
    );
  });
});

test("GET /eienaar/water reports the latest reading and the delta against the one before it", async () => {
  await withTestDb(async (db) => {
    const { app, deps } = await buildTestApp(db);
    const { farm, person, membership } = await seedFarm(db);
    const [device] = await db.insert(devices).values({ farmId: farm.id }).returning();
    const [point] = await db.insert(waterPoints).values({ farmId: farm.id, name: "Boorgat 1", unit: "m³" }).returning();

    await db.insert(meterReadings).values([
      { farmId: farm.id, moduleCode: "water", createdBy: person.id, deviceId: device.id, waterPointId: point.id, reading: 1000, createdAt: new Date("2026-05-01T00:00:00Z") },
      { farmId: farm.id, moduleCode: "water", createdBy: person.id, deviceId: device.id, waterPointId: point.id, reading: 1250, createdAt: new Date("2026-06-01T00:00:00Z") },
    ]);

    const token = await signStaffSession({ farmMembershipId: membership.id, farmId: farm.id, role: "owner" }, deps.env.staffSessionSecret);
    const response = await app.inject({ method: "GET", url: "/eienaar/water", headers: { authorization: `Bearer ${token}` } });

    assert.equal(response.statusCode, 200);
    const [row] = response.json().points;
    assert.equal(row.latestReading, 1250);
    assert.equal(row.delta, 250);
  });
});

test("a point with only one reading has no delta yet", async () => {
  await withTestDb(async (db) => {
    const { app, deps } = await buildTestApp(db);
    const { farm, person, membership } = await seedFarm(db);
    const [device] = await db.insert(devices).values({ farmId: farm.id }).returning();
    const [point] = await db.insert(waterPoints).values({ farmId: farm.id, name: "Boorgat 1", unit: "m³" }).returning();

    await db.insert(meterReadings).values({ farmId: farm.id, moduleCode: "water", createdBy: person.id, deviceId: device.id, waterPointId: point.id, reading: 500 });

    const token = await signStaffSession({ farmMembershipId: membership.id, farmId: farm.id, role: "owner" }, deps.env.staffSessionSecret);
    const response = await app.inject({ method: "GET", url: "/eienaar/water", headers: { authorization: `Bearer ${token}` } });

    const [row] = response.json().points;
    assert.equal(row.latestReading, 500);
    assert.equal(row.delta, null);
  });
});

test("a dropping reading is reported as a negative delta, never rejected", async () => {
  await withTestDb(async (db) => {
    const { app, deps } = await buildTestApp(db);
    const { farm, person, membership } = await seedFarm(db);
    const [device] = await db.insert(devices).values({ farmId: farm.id }).returning();
    const [point] = await db.insert(waterPoints).values({ farmId: farm.id, name: "Boorgat 1", unit: "m³" }).returning();

    await db.insert(meterReadings).values([
      { farmId: farm.id, moduleCode: "water", createdBy: person.id, deviceId: device.id, waterPointId: point.id, reading: 1000, createdAt: new Date("2026-05-01T00:00:00Z") },
      // A replaced meter, or a dam that dropped — the number is trusted, not corrected.
      { farmId: farm.id, moduleCode: "water", createdBy: person.id, deviceId: device.id, waterPointId: point.id, reading: 20, createdAt: new Date("2026-06-01T00:00:00Z") },
    ]);

    const token = await signStaffSession({ farmMembershipId: membership.id, farmId: farm.id, role: "owner" }, deps.env.staffSessionSecret);
    const response = await app.inject({ method: "GET", url: "/eienaar/water", headers: { authorization: `Bearer ${token}` } });

    const [row] = response.json().points;
    assert.equal(row.latestReading, 20);
    assert.equal(row.delta, -980);
  });
});
