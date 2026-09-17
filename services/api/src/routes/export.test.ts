import assert from "node:assert/strict";
import test from "node:test";
import { blocks, devices, harvestEvents, notes } from "@plaashek/schema";
import { signStaffSession } from "../auth/staff-jwt.js";
import { buildTestApp } from "../test/app.js";
import { withTestDb } from "../test/db.js";
import { seedFarm } from "../test/fixtures.js";

test("GET /export/notes.csv scopes to the farm and quotes a comma in the body", async () => {
  await withTestDb(async (db) => {
    const { app, deps } = await buildTestApp(db);
    const { farm, person, membership } = await seedFarm(db);
    const { farm: otherFarm, person: otherPerson } = await seedFarm(db);

    const [block] = await db.insert(blocks).values({ farmId: farm.id, name: "Blok A" }).returning();
    const [device] = await db.insert(devices).values({ farmId: farm.id }).returning();
    const [otherDevice] = await db.insert(devices).values({ farmId: otherFarm.id }).returning();

    await db.insert(notes).values([
      { farmId: farm.id, moduleCode: "veldnotas", createdBy: person.id, deviceId: device.id, blockId: block.id, body: "Rooi vrugte, min reën" },
      { farmId: otherFarm.id, moduleCode: "veldnotas", createdBy: otherPerson.id, deviceId: otherDevice.id, body: "Other farm's note" },
    ]);

    const token = await signStaffSession({ farmMembershipId: membership.id, farmId: farm.id, role: "owner" }, deps.env.staffSessionSecret);
    const response = await app.inject({ method: "GET", url: "/export/notes.csv", headers: { authorization: `Bearer ${token}` } });

    assert.equal(response.statusCode, 200);
    assert.match(response.headers["content-type"] as string, /text\/csv/);
    const body = response.body;
    assert.match(body, /^﻿id,created_at,person,block,season,body,latitude,longitude,weather_temp,weather_humidity,weather_condition\r\n/);
    assert.match(body, /"Rooi vrugte, min reën"/);
    assert.equal(body.includes("Other farm's note"), false);
  });
});

test("GET /export/harvest.csv totals every capture for the farm, not just the active season", async () => {
  await withTestDb(async (db) => {
    const { app, deps } = await buildTestApp(db);
    const { farm, person, membership } = await seedFarm(db);

    const [block] = await db.insert(blocks).values({ farmId: farm.id, name: "Blok A" }).returning();
    const [device] = await db.insert(devices).values({ farmId: farm.id }).returning();

    await db.insert(harvestEvents).values([
      { farmId: farm.id, moduleCode: "boord", createdBy: person.id, deviceId: device.id, blockId: block.id, weightKg: 12.5 },
    ]);

    const token = await signStaffSession({ farmMembershipId: membership.id, farmId: farm.id, role: "admin" }, deps.env.staffSessionSecret);
    const response = await app.inject({ method: "GET", url: "/export/harvest.csv", headers: { authorization: `Bearer ${token}` } });

    assert.equal(response.statusCode, 200);
    assert.equal(response.headers["content-disposition"], 'attachment; filename="boord.csv"');
    const lines = response.body.split("\r\n");
    assert.equal(lines[0], "﻿id,created_at,person,block,season,weight_kg,deduction_kg,weather_temp,weather_humidity,weather_condition");
    assert.match(lines[1], /,Blok A,,12\.5,,,,$/);
  });
});
