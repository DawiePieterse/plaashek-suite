import assert from "node:assert/strict";
import test from "node:test";
import { seasons } from "@plaashek/schema";
import { eq } from "drizzle-orm";
import { signStaffSession } from "../auth/staff-jwt.js";
import { buildTestApp } from "../test/app.js";
import { withTestDb } from "../test/db.js";
import { seedFarm } from "../test/fixtures.js";

const season = (name: string, isActive = false) => ({ name, startsOn: "2026-11-01", endsOn: "2027-02-15", isActive });

test("activating a season stands the previous one down, one active per farm", async () => {
  await withTestDb(async (db) => {
    const { app, deps } = await buildTestApp(db);
    const { farm, membership } = await seedFarm(db);
    const token = await signStaffSession(
      { farmMembershipId: membership.id, farmId: farm.id, role: "admin" },
      deps.env.staffSessionSecret,
    );
    const headers = { authorization: `Bearer ${token}` };

    const first = await app.inject({ method: "POST", url: "/seasons", headers, payload: season("Oes 2025/26", true) });
    assert.equal(first.statusCode, 200);
    assert.equal(first.json().season.isActive, true);

    // The partial unique index would reject this if the old one did not stand down.
    const second = await app.inject({ method: "POST", url: "/seasons", headers, payload: season("Oes 2026/27", true) });
    assert.equal(second.statusCode, 200);

    const rows = await db.select().from(seasons).where(eq(seasons.farmId, farm.id));
    assert.deepEqual(
      rows.filter((r) => r.isActive).map((r) => r.name),
      ["Oes 2026/27"],
    );

    // Dates stay editable — a pick runs late more often than not.
    const patched = await app.inject({
      method: "PATCH",
      url: `/seasons/${second.json().season.id}`,
      headers,
      payload: { endsOn: "2027-03-31" },
    });
    assert.equal(patched.statusCode, 200);
    assert.equal(patched.json().season.endsOn, "2027-03-31");
  });
});

test("another farm's season is not visible and cannot be edited", async () => {
  await withTestDb(async (db) => {
    const { app, deps } = await buildTestApp(db);
    const mine = await seedFarm(db, { email: "mine@example.com" });
    const theirs = await seedFarm(db, { email: "theirs@example.com" });

    const [theirSeason] = await db
      .insert(seasons)
      .values({ farmId: theirs.farm.id, name: "Hulle seisoen", startsOn: "2026-01-01", endsOn: "2026-12-31" })
      .returning();

    const token = await signStaffSession(
      { farmMembershipId: mine.membership.id, farmId: mine.farm.id, role: "admin" },
      deps.env.staffSessionSecret,
    );
    const headers = { authorization: `Bearer ${token}` };

    const list = await app.inject({ method: "GET", url: "/seasons", headers });
    assert.deepEqual(list.json().seasons, []);

    const patch = await app.inject({ method: "PATCH", url: `/seasons/${theirSeason.id}`, headers, payload: { name: "Gekaap" } });
    assert.equal(patch.statusCode, 404);
  });
});
