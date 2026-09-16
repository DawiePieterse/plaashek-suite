import assert from "node:assert/strict";
import test from "node:test";
import { generateKeyPair } from "jose";
import { mintTicket, verifyTicket } from "./ticket.js";

test("ticket claims are the floor clipped to the ceiling", async () => {
  const { publicKey, privateKey } = await generateKeyPair("EdDSA");

  const token = await mintTicket({
    farmId: "farm-1",
    deviceId: "device-1",
    farmModules: ["boord", "veldnotas"],
    deviceModules: ["boord", "kudde"], // paired for kudde, but farm never bought it
    signingKey: privateKey,
  });

  const claims = await verifyTicket(token, publicKey);
  assert.deepEqual(claims.modules, ["boord"]);
  assert.equal(claims.farmId, "farm-1");
  assert.equal(claims.deviceId, "device-1");
});

test("verifyTicket rejects a signature from the wrong key", async () => {
  const minted = await generateKeyPair("EdDSA");
  const other = await generateKeyPair("EdDSA");

  const token = await mintTicket({
    farmId: "farm-1",
    deviceId: "device-1",
    farmModules: ["boord"],
    deviceModules: ["boord"],
    signingKey: minted.privateKey,
  });

  await assert.rejects(() => verifyTicket(token, other.publicKey));
});

test("verifyTicket rejects an expired ticket (21-day ticket life, ADR 0003)", async () => {
  const { publicKey, privateKey } = await generateKeyPair("EdDSA");
  const mintedAt = new Date("2026-01-01T00:00:00Z");

  const token = await mintTicket({
    farmId: "farm-1",
    deviceId: "device-1",
    farmModules: ["boord"],
    deviceModules: ["boord"],
    signingKey: privateKey,
    now: mintedAt,
  });

  const justBeforeExpiry = new Date(mintedAt.getTime() + 20 * 24 * 60 * 60 * 1000);
  await assert.doesNotReject(() => verifyTicket(token, publicKey, justBeforeExpiry));

  const justAfterExpiry = new Date(mintedAt.getTime() + 22 * 24 * 60 * 60 * 1000);
  await assert.rejects(() => verifyTicket(token, publicKey, justAfterExpiry));
});
