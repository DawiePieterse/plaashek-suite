import assert from "node:assert/strict";
import test from "node:test";
import { animals } from "@plaashek/schema";
import { mintTicket } from "@plaashek/tickets";
import { buildTestApp } from "../test/app.js";
import { withTestDb } from "../test/db.js";
import { seedFarm } from "../test/fixtures.js";

test("GET /animal-catalog returns only this farm's active animals, ordered by tag number", async () => {
  await withTestDb(async (db) => {
    const { app, deps } = await buildTestApp(db);
    const mine = await seedFarm(db, { email: "mine@example.com" });
    const theirs = await seedFarm(db, { email: "theirs@example.com" });

    await db.insert(animals).values([
      { farmId: mine.farm.id, tagNumber: "014", sex: "cow" },
      { farmId: mine.farm.id, tagNumber: "003", sex: "bull" },
      { farmId: mine.farm.id, tagNumber: "099", sex: "cow", active: false },
      { farmId: theirs.farm.id, tagNumber: "001", sex: "cow" },
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

    const response = await app.inject({ method: "GET", url: "/animal-catalog", headers: { authorization: `Bearer ${ticket}` } });
    assert.equal(response.statusCode, 200);
    assert.deepEqual(
      response.json().animals.map((a: { tagNumber: string }) => a.tagNumber),
      ["003", "014"],
    );
  });
});
