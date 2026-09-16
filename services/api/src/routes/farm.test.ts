import assert from "node:assert/strict";
import test from "node:test";
import { devices, entitlements, heldWrites, notes, people } from "@plaashek/schema";
import { signStaffSession } from "../auth/staff-jwt.js";
import { buildTestApp } from "../test/app.js";
import { withTestDb } from "../test/db.js";
import { seedFarm } from "../test/fixtures.js";

test("GET /farm returns only this farm's people and licensed modules", async () => {
  await withTestDb(async (db) => {
    const { app, deps } = await buildTestApp(db);
    const mine = await seedFarm(db, { email: "mine@example.com" });
    const theirs = await seedFarm(db, { email: "theirs@example.com" });

    await db.insert(people).values({ farmId: theirs.farm.id, name: "Ander Plaas Persoon" });

    // Workspace rows have no foreign key to farms, so the counts must filter by hand.
    const [theirDevice] = await db.insert(devices).values({ farmId: theirs.farm.id }).returning();
    await db.insert(notes).values({
      farmId: theirs.farm.id,
      moduleCode: "veldnotas",
      seasonId: null,
      createdBy: theirs.person.id,
      deviceId: theirDevice.id,
      body: "Hulle nota",
    });
    await db.insert(heldWrites).values({
      farmId: theirs.farm.id,
      moduleCode: "veldnotas",
      deviceId: theirDevice.id,
      entity: "notes",
      entityId: crypto.randomUUID(),
      payload: { body: "Hulle gehoue nota" },
      clientTime: new Date(),
    });
    await db.insert(entitlements).values([
      { farmId: mine.farm.id, moduleCode: "boord", status: "active" },
      { farmId: mine.farm.id, moduleCode: "kudde", status: "cancelled" },
      { farmId: theirs.farm.id, moduleCode: "stoor", status: "active" },
    ]);

    const staffToken = await signStaffSession(
      { farmMembershipId: mine.membership.id, farmId: mine.farm.id, role: "admin" },
      deps.env.staffSessionSecret,
    );

    const res = await app.inject({ method: "GET", url: "/farm", headers: { authorization: `Bearer ${staffToken}` } });
    assert.equal(res.statusCode, 200);

    const body = res.json() as {
      farm: { id: string };
      people: { id: string }[];
      modules: string[];
      waiting: { held: number; withoutSeason: number };
    };
    assert.equal(body.farm.id, mine.farm.id);
    assert.deepEqual(
      body.people.map((p) => p.id),
      [mine.person.id],
    );
    assert.deepEqual(body.modules, ["boord"]);
    assert.deepEqual(body.waiting, { held: 0, withoutSeason: 0 });
  });
});
