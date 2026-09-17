import assert from "node:assert/strict";
import test from "node:test";
import { entitlements, farms } from "@plaashek/schema";
import { eq } from "drizzle-orm";
import { buildTestApp } from "../test/app.js";
import { withTestDb } from "../test/db.js";
import { seedFarm, seedManagementStaff } from "../test/fixtures.js";

test("POST /management/login rejects wrong password", async () => {
  await withTestDb(async (db) => {
    const { app } = await buildTestApp(db);
    const { staff } = await seedManagementStaff(db, { email: "wrongpass@example.com" });

    const res = await app.inject({
      method: "POST",
      url: "/management/login",
      payload: { email: staff.email, password: "not-it" },
    });

    assert.equal(res.statusCode, 401);
  });
});

test("a farm office session cannot authenticate against Plaashek Management", async () => {
  await withTestDb(async (db) => {
    const { app, deps } = await buildTestApp(db);
    const { membership } = await seedFarm(db);
    const { signStaffSession } = await import("../auth/staff-jwt.js");
    const farmToken = await signStaffSession(
      { farmMembershipId: membership.id, farmId: membership.farmId, role: "admin" },
      deps.env.staffSessionSecret,
    );

    const res = await app.inject({ method: "GET", url: "/management/farms", headers: { authorization: `Bearer ${farmToken}` } });

    assert.equal(res.statusCode, 401);
  });
});

test("Plaashek Management creates a farm and sets its entitlements, invisible to farm office logins", async () => {
  await withTestDb(async (db) => {
    const { app } = await buildTestApp(db);
    const { staff, password } = await seedManagementStaff(db, { email: "manager@plaashek.test" });

    const login = await app.inject({ method: "POST", url: "/management/login", payload: { email: staff.email, password } });
    assert.equal(login.statusCode, 200);
    const { token } = login.json() as { token: string };

    const create = await app.inject({
      method: "POST",
      url: "/management/farms",
      headers: { authorization: `Bearer ${token}` },
      payload: { organisationName: "Bekfontein Bpk", farmName: "Bekfontein", language: "af" },
    });
    assert.equal(create.statusCode, 200);
    const { farm } = create.json() as { farm: { id: string; name: string } };
    assert.equal(farm.name, "Bekfontein");

    const setEntitlement = await app.inject({
      method: "PUT",
      url: `/management/farms/${farm.id}/entitlements`,
      headers: { authorization: `Bearer ${token}` },
      payload: { moduleCode: "boord", status: "active" },
    });
    assert.equal(setEntitlement.statusCode, 200);

    const [row] = await db.select().from(entitlements).where(eq(entitlements.farmId, farm.id));
    assert.equal(row.moduleCode, "boord");
    assert.equal(row.status, "active");

    // Re-setting the same module updates in place rather than duplicating the row (unique farmId+moduleCode).
    const revoke = await app.inject({
      method: "PUT",
      url: `/management/farms/${farm.id}/entitlements`,
      headers: { authorization: `Bearer ${token}` },
      payload: { moduleCode: "boord", status: "cancelled" },
    });
    assert.equal(revoke.statusCode, 200);
    const rows = await db.select().from(entitlements).where(eq(entitlements.farmId, farm.id));
    assert.equal(rows.length, 1);
    assert.equal(rows[0].status, "cancelled");

    const list = await app.inject({ method: "GET", url: "/management/farms", headers: { authorization: `Bearer ${token}` } });
    const { farms: listed } = list.json() as { farms: { farm: { id: string } }[] };
    assert.ok(listed.some((f) => f.farm.id === farm.id));

    const [stored] = await db.select().from(farms).where(eq(farms.id, farm.id));
    assert.equal(stored.name, "Bekfontein");
  });
});
