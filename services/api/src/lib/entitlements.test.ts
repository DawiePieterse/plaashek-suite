import assert from "node:assert/strict";
import test from "node:test";
import { entitlements, farms, organisations } from "@plaashek/schema";
import { mintTicket, verifyTicket } from "@plaashek/tickets";
import { generateKeyPair } from "jose";
import { withTestDb } from "../test/db.js";
import { activeModuleCodes } from "./entitlements.js";

test("ceiling excludes suspended/cancelled modules, and a minted ticket clips the floor to it", async () => {
  await withTestDb(async (db) => {
    const [org] = await db.insert(organisations).values({ name: "Org" }).returning();
    const [farm] = await db.insert(farms).values({ organisationId: org.id, name: "Farm" }).returning();

    await db.insert(entitlements).values([
      { farmId: farm.id, moduleCode: "boord", status: "active" },
      { farmId: farm.id, moduleCode: "kudde", status: "suspended" },
    ]);

    const ceiling = await activeModuleCodes(db, farm.id);
    assert.deepEqual([...ceiling].sort(), ["boord"]);

    const { privateKey, publicKey } = await generateKeyPair("EdDSA");
    const token = await mintTicket({
      farmId: farm.id,
      deviceId: "device-1",
      farmModules: ceiling,
      deviceModules: ["boord", "kudde"],
      language: "af",
      seasonId: null,
      signingKey: privateKey,
    });

    const claims = await verifyTicket(token, publicKey);
    assert.deepEqual(claims.modules, ["boord"]);
  });
});

test("grace status counts toward the ceiling the same as active", async () => {
  await withTestDb(async (db) => {
    const [org] = await db.insert(organisations).values({ name: "Org" }).returning();
    const [farm] = await db.insert(farms).values({ organisationId: org.id, name: "Farm" }).returning();

    await db.insert(entitlements).values({ farmId: farm.id, moduleCode: "veldnotas", status: "grace" });

    const ceiling = await activeModuleCodes(db, farm.id);
    assert.deepEqual(ceiling, ["veldnotas"]);
  });
});
