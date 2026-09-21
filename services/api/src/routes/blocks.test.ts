import assert from "node:assert/strict";
import test from "node:test";
import { blocks, camps } from "@plaashek/schema";
import { mintTicket } from "@plaashek/tickets";
import { buildTestApp } from "../test/app.js";
import { withTestDb } from "../test/db.js";
import { seedFarm } from "../test/fixtures.js";

test("GET /blocks returns only this farm's blocks, alphabetical", async () => {
  await withTestDb(async (db) => {
    const { app, deps } = await buildTestApp(db);
    const mine = await seedFarm(db, { email: "mine@example.com" });
    const theirs = await seedFarm(db, { email: "theirs@example.com" });

    await db.insert(blocks).values([
      { farmId: mine.farm.id, name: "Blok B" },
      { farmId: mine.farm.id, name: "Blok A" },
      { farmId: theirs.farm.id, name: "Ander Plaas se Blok" },
    ]);

    const ticket = await mintTicket({
      farmId: mine.farm.id,
      deviceId: crypto.randomUUID(),
      farmModules: ["boord"],
      deviceModules: ["boord"],
      language: "af",
      seasonId: null,
      signingKey: deps.keys.privateKey,
    });

    const response = await app.inject({ method: "GET", url: "/blocks", headers: { authorization: `Bearer ${ticket}` } });
    assert.equal(response.statusCode, 200);
    assert.deepEqual(
      response.json().blocks.map((b: { name: string }) => b.name),
      ["Blok A", "Blok B"],
    );
  });
});

test("GET /camps returns only this farm's camps, alphabetical", async () => {
  await withTestDb(async (db) => {
    const { app, deps } = await buildTestApp(db);
    const mine = await seedFarm(db, { email: "mine@example.com" });
    const theirs = await seedFarm(db, { email: "theirs@example.com" });

    await db.insert(camps).values([
      { farmId: mine.farm.id, name: "Kamp 2" },
      { farmId: mine.farm.id, name: "Kamp 1" },
      { farmId: theirs.farm.id, name: "Ander Plaas se Kamp" },
    ]);

    const ticket = await mintTicket({
      farmId: mine.farm.id,
      deviceId: crypto.randomUUID(),
      farmModules: ["kudde"],
      deviceModules: ["kudde"],
      language: "af",
      seasonId: null,
      signingKey: deps.keys.privateKey,
    });

    const response = await app.inject({ method: "GET", url: "/camps", headers: { authorization: `Bearer ${ticket}` } });
    assert.equal(response.statusCode, 200);
    assert.deepEqual(
      response.json().camps.map((c: { name: string }) => c.name),
      ["Kamp 1", "Kamp 2"],
    );
  });
});
