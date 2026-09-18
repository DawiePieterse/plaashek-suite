import assert from "node:assert/strict";
import test from "node:test";
import { assets } from "@plaashek/schema";
import { mintTicket } from "@plaashek/tickets";
import { buildTestApp } from "../test/app.js";
import { withTestDb } from "../test/db.js";
import { seedFarm } from "../test/fixtures.js";

test("GET /assets returns only this farm's assets, alphabetical", async () => {
  await withTestDb(async (db) => {
    const { app, deps } = await buildTestApp(db);
    const mine = await seedFarm(db, { email: "mine@example.com" });
    const theirs = await seedFarm(db, { email: "theirs@example.com" });

    await db.insert(assets).values([
      { farmId: mine.farm.id, name: "Trekker" },
      { farmId: mine.farm.id, name: "Boorgat 1" },
      { farmId: theirs.farm.id, name: "Ander Plaas se Trekker" },
    ]);

    const ticket = await mintTicket({
      farmId: mine.farm.id,
      deviceId: crypto.randomUUID(),
      farmModules: ["water"],
      deviceModules: ["water"],
      language: "af",
      seasonId: null,
      signingKey: deps.keys.privateKey,
    });

    const response = await app.inject({ method: "GET", url: "/assets", headers: { authorization: `Bearer ${ticket}` } });
    assert.equal(response.statusCode, 200);
    assert.deepEqual(
      response.json().assets.map((a: { name: string }) => a.name),
      ["Boorgat 1", "Trekker"],
    );
  });
});
