import assert from "node:assert/strict";
import test from "node:test";
import { devices } from "@plaashek/schema";
import { seedFarm } from "../test/fixtures.js";
import { buildTestApp } from "../test/app.js";
import { withTestDb } from "../test/db.js";
import { signStaffSession } from "./staff-jwt.js";

test("a farm A staff token cannot reach farm B's device", async () => {
  await withTestDb(async (db) => {
    const { farm: farmA, membership: membershipA } = await seedFarm(db);
    const { farm: farmB } = await seedFarm(db);
    const [deviceB] = await db.insert(devices).values({ farmId: farmB.id, label: "B device" }).returning();

    const { app, deps } = await buildTestApp(db);
    const token = await signStaffSession(
      { farmMembershipId: membershipA.id, farmId: farmA.id, role: "admin" },
      deps.env.staffSessionSecret,
    );

    const response = await app.inject({
      method: "POST",
      url: `/devices/${deviceB.id}/apps`,
      headers: { authorization: `Bearer ${token}` },
      payload: { moduleCode: "boord" },
    });

    assert.equal(response.statusCode, 404);
  });
});

test("owner role is rejected from an admin-only route", async () => {
  await withTestDb(async (db) => {
    const { farm, membership } = await seedFarm(db, { role: "owner" });
    const [device] = await db.insert(devices).values({ farmId: farm.id, label: "Device" }).returning();

    const { app, deps } = await buildTestApp(db);
    const token = await signStaffSession(
      { farmMembershipId: membership.id, farmId: farm.id, role: "owner" },
      deps.env.staffSessionSecret,
    );

    const response = await app.inject({
      method: "POST",
      url: `/devices/${device.id}/apps`,
      headers: { authorization: `Bearer ${token}` },
      payload: { moduleCode: "boord" },
    });

    assert.equal(response.statusCode, 403);
  });
});

test("missing bearer token is rejected", async () => {
  await withTestDb(async (db) => {
    const { app } = await buildTestApp(db);
    const response = await app.inject({ method: "GET", url: "/devices" });
    assert.equal(response.statusCode, 401);
  });
});
