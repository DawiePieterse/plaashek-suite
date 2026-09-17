import assert from "node:assert/strict";
import test from "node:test";
import { blocks, camps, people } from "@plaashek/schema";
import { eq } from "drizzle-orm";
import { signStaffSession } from "../auth/staff-jwt.js";
import { buildTestApp } from "../test/app.js";
import { withTestDb } from "../test/db.js";
import { seedFarm } from "../test/fixtures.js";

test("admin can create a person, a block and a camp; owner cannot", async () => {
  await withTestDb(async (db) => {
    const { app, deps } = await buildTestApp(db);
    const { farm, membership } = await seedFarm(db);
    const adminToken = await signStaffSession(
      { farmMembershipId: membership.id, farmId: farm.id, role: "admin" },
      deps.env.staffSessionSecret,
    );
    const adminHeaders = { authorization: `Bearer ${adminToken}` };

    const person = await app.inject({ method: "POST", url: "/people", headers: adminHeaders, payload: { name: "Petrus" } });
    assert.equal(person.statusCode, 200);
    assert.equal(person.json().person.name, "Petrus");
    assert.equal(person.json().person.farmId, farm.id);

    const block = await app.inject({ method: "POST", url: "/blocks", headers: adminHeaders, payload: { name: "Blok A" } });
    assert.equal(block.statusCode, 200);
    assert.equal(block.json().block.name, "Blok A");

    const camp = await app.inject({
      method: "POST",
      url: "/camps",
      headers: adminHeaders,
      payload: { name: "Kamp 1", blockId: block.json().block.id },
    });
    assert.equal(camp.statusCode, 200);
    assert.equal(camp.json().camp.blockId, block.json().block.id);

    const ownerToken = await signStaffSession(
      { farmMembershipId: membership.id, farmId: farm.id, role: "owner" },
      deps.env.staffSessionSecret,
    );
    const forbidden = await app.inject({
      method: "POST",
      url: "/people",
      headers: { authorization: `Bearer ${ownerToken}` },
      payload: { name: "Should fail" },
    });
    assert.equal(forbidden.statusCode, 403);

    const farmContext = await app.inject({ method: "GET", url: "/farm", headers: adminHeaders });
    // seedFarm already put down one person ("Person") to own the staff login.
    assert.deepEqual(
      farmContext.json().people.map((p: { name: string }) => p.name).sort(),
      ["Person", "Petrus"],
    );
    assert.deepEqual(
      farmContext.json().blocks.map((b: { name: string }) => b.name),
      ["Blok A"],
    );
    assert.deepEqual(
      farmContext.json().camps.map((c: { name: string }) => c.name),
      ["Kamp 1"],
    );
  });
});

test("a camp cannot claim another farm's block", async () => {
  await withTestDb(async (db) => {
    const { app, deps } = await buildTestApp(db);
    const mine = await seedFarm(db, { email: "mine@example.com" });
    const theirs = await seedFarm(db, { email: "theirs@example.com" });

    const [theirBlock] = await db.insert(blocks).values({ farmId: theirs.farm.id, name: "Hulle blok" }).returning();

    const token = await signStaffSession(
      { farmMembershipId: mine.membership.id, farmId: mine.farm.id, role: "admin" },
      deps.env.staffSessionSecret,
    );

    const res = await app.inject({
      method: "POST",
      url: "/camps",
      headers: { authorization: `Bearer ${token}` },
      payload: { name: "Gekaapte kamp", blockId: theirBlock.id },
    });
    assert.equal(res.statusCode, 404);

    const rows = await db.select().from(camps).where(eq(camps.farmId, mine.farm.id));
    assert.deepEqual(rows, []);
  });
});

test("people, blocks and camps are farm-scoped in GET /farm", async () => {
  await withTestDb(async (db) => {
    const { app, deps } = await buildTestApp(db);
    const mine = await seedFarm(db, { email: "mine@example.com" });
    const theirs = await seedFarm(db, { email: "theirs@example.com" });

    await db.insert(people).values({ farmId: theirs.farm.id, name: "Hulle persoon" });
    await db.insert(blocks).values({ farmId: theirs.farm.id, name: "Hulle blok" });

    const token = await signStaffSession(
      { farmMembershipId: mine.membership.id, farmId: mine.farm.id, role: "admin" },
      deps.env.staffSessionSecret,
    );

    const res = await app.inject({ method: "GET", url: "/farm", headers: { authorization: `Bearer ${token}` } });
    const body = res.json();
    assert.deepEqual(
      body.people.map((p: { id: string }) => p.id),
      [mine.person.id],
    );
    assert.deepEqual(body.blocks, []);
    assert.deepEqual(body.camps, []);
  });
});
