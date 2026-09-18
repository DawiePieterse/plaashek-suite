import assert from "node:assert/strict";
import test from "node:test";
import { assets, blocks, camps, people } from "@plaashek/schema";
import { eq } from "drizzle-orm";
import { signStaffSession } from "../auth/staff-jwt.js";
import { buildTestApp } from "../test/app.js";
import { withTestDb } from "../test/db.js";
import { seedFarm } from "../test/fixtures.js";

test("admin and owner can both create a person, a block, a camp and an asset", async () => {
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

    const asset = await app.inject({ method: "POST", url: "/assets", headers: adminHeaders, payload: { name: "Boorgat 1" } });
    assert.equal(asset.statusCode, 200);
    assert.equal(asset.json().asset.name, "Boorgat 1");
    assert.equal(asset.json().asset.farmId, farm.id);

    // Owner has the same rights as admin in the Farm Admin Tool.
    const ownerToken = await signStaffSession(
      { farmMembershipId: membership.id, farmId: farm.id, role: "owner" },
      deps.env.staffSessionSecret,
    );
    const ownerHeaders = { authorization: `Bearer ${ownerToken}` };
    const ownerPerson = await app.inject({ method: "POST", url: "/people", headers: ownerHeaders, payload: { name: "Owner Toets" } });
    assert.equal(ownerPerson.statusCode, 200);
    assert.equal(ownerPerson.json().person.name, "Owner Toets");

    const farmContext = await app.inject({ method: "GET", url: "/farm", headers: adminHeaders });
    // seedFarm already put down one person ("Person") to own the staff login.
    assert.deepEqual(
      farmContext.json().people.map((p: { name: string }) => p.name).sort(),
      ["Owner Toets", "Person", "Petrus"].sort(),
    );
    assert.deepEqual(
      farmContext.json().blocks.map((b: { name: string }) => b.name),
      ["Blok A"],
    );
    assert.deepEqual(
      farmContext.json().camps.map((c: { name: string }) => c.name),
      ["Kamp 1"],
    );
    assert.deepEqual(
      farmContext.json().assets.map((a: { name: string }) => a.name),
      ["Boorgat 1"],
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

test("people, blocks, camps and assets are farm-scoped in GET /farm", async () => {
  await withTestDb(async (db) => {
    const { app, deps } = await buildTestApp(db);
    const mine = await seedFarm(db, { email: "mine@example.com" });
    const theirs = await seedFarm(db, { email: "theirs@example.com" });

    await db.insert(people).values({ farmId: theirs.farm.id, name: "Hulle persoon" });
    await db.insert(blocks).values({ farmId: theirs.farm.id, name: "Hulle blok" });
    await db.insert(assets).values({ farmId: theirs.farm.id, name: "Hulle trekker" });

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
    assert.deepEqual(body.assets, []);
  });
});
