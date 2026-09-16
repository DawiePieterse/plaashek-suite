import assert from "node:assert/strict";
import test from "node:test";
import { entitlements, pairingTokens } from "@plaashek/schema";
import { verifyTicket } from "@plaashek/tickets";
import { eq } from "drizzle-orm";
import { signStaffSession } from "../auth/staff-jwt.js";
import type { Db } from "../db.js";
import { buildTestApp } from "../test/app.js";
import { withTestDb } from "../test/db.js";
import { seedFarm } from "../test/fixtures.js";

type EntitlementStatus = "active" | "grace" | "suspended" | "cancelled";

async function setupFarm(db: Db, moduleCode: string, status: EntitlementStatus | null) {
  const { farm, person, membership } = await seedFarm(db);

  if (status) {
    await db.insert(entitlements).values({ farmId: farm.id, moduleCode, status });
  }

  return { farm, person, membership };
}

test("scanning a pairing token twice: second scan is rejected as already used", async () => {
  await withTestDb(async (db) => {
    const { app, deps } = await buildTestApp(db);
    const { farm, person, membership } = await setupFarm(db, "boord", "active");
    const staffToken = await signStaffSession({ farmMembershipId: membership.id, farmId: farm.id, role: "admin" }, deps.env.staffSessionSecret);

    const add = await app.inject({
      method: "POST",
      url: "/devices",
      headers: { authorization: `Bearer ${staffToken}` },
      payload: { personId: person.id, moduleCode: "boord" },
    });
    assert.equal(add.statusCode, 200);
    const pairingToken = add.json().pairingToken.token as string;

    const first = await app.inject({ method: "POST", url: `/pair/${pairingToken}` });
    assert.equal(first.statusCode, 200);

    const second = await app.inject({ method: "POST", url: `/pair/${pairingToken}` });
    assert.equal(second.statusCode, 409);
    assert.equal(second.json().error.code, "token_used");
  });
});

test("reprint cancels the old token and issues a fresh one", async () => {
  await withTestDb(async (db) => {
    const { app, deps } = await buildTestApp(db);
    const { farm, person, membership } = await setupFarm(db, "boord", "active");
    const staffToken = await signStaffSession({ farmMembershipId: membership.id, farmId: farm.id, role: "admin" }, deps.env.staffSessionSecret);

    const add = await app.inject({
      method: "POST",
      url: "/devices",
      headers: { authorization: `Bearer ${staffToken}` },
      payload: { personId: person.id, moduleCode: "boord" },
    });
    const oldToken = add.json().pairingToken as { id: string; token: string };

    const reprint = await app.inject({
      method: "POST",
      url: `/pairing-tokens/${oldToken.id}/reprint`,
      headers: { authorization: `Bearer ${staffToken}` },
    });
    assert.equal(reprint.statusCode, 200);
    const newToken = reprint.json().pairingToken.token as string;
    assert.notEqual(newToken, oldToken.token);

    const scanOld = await app.inject({ method: "POST", url: `/pair/${oldToken.token}` });
    assert.equal(scanOld.statusCode, 410);
    assert.equal(scanOld.json().error.code, "token_cancelled");

    const scanNew = await app.inject({ method: "POST", url: `/pair/${newToken}` });
    assert.equal(scanNew.statusCode, 200);
  });
});

test("cancelling a pending token then scanning it fails", async () => {
  await withTestDb(async (db) => {
    const { app, deps } = await buildTestApp(db);
    const { farm, person, membership } = await setupFarm(db, "boord", "active");
    const staffToken = await signStaffSession({ farmMembershipId: membership.id, farmId: farm.id, role: "admin" }, deps.env.staffSessionSecret);

    const add = await app.inject({
      method: "POST",
      url: "/devices",
      headers: { authorization: `Bearer ${staffToken}` },
      payload: { personId: person.id, moduleCode: "boord" },
    });
    const pairingToken = add.json().pairingToken as { id: string; token: string };

    const cancel = await app.inject({
      method: "POST",
      url: `/pairing-tokens/${pairingToken.id}/cancel`,
      headers: { authorization: `Bearer ${staffToken}` },
    });
    assert.equal(cancel.statusCode, 200);

    const scan = await app.inject({ method: "POST", url: `/pair/${pairingToken.token}` });
    assert.equal(scan.statusCode, 410);
    assert.equal(scan.json().error.code, "token_cancelled");
  });
});

test("an expired pairing token cannot be scanned", async () => {
  await withTestDb(async (db) => {
    const { app, deps } = await buildTestApp(db);
    const { farm, person, membership } = await setupFarm(db, "boord", "active");
    const staffToken = await signStaffSession({ farmMembershipId: membership.id, farmId: farm.id, role: "admin" }, deps.env.staffSessionSecret);

    const add = await app.inject({
      method: "POST",
      url: "/devices",
      headers: { authorization: `Bearer ${staffToken}` },
      payload: { personId: person.id, moduleCode: "boord" },
    });
    const pairingToken = add.json().pairingToken as { id: string; token: string };

    await db.update(pairingTokens).set({ expiresAt: new Date(Date.now() - 1000) }).where(eq(pairingTokens.id, pairingToken.id));

    const scan = await app.inject({ method: "POST", url: `/pair/${pairingToken.token}` });
    assert.equal(scan.statusCode, 410);
    assert.equal(scan.json().error.code, "token_expired");
  });
});

test("a device cannot be stamped with another farm's person", async () => {
  await withTestDb(async (db) => {
    const { app, deps } = await buildTestApp(db);
    const { farm, membership } = await setupFarm(db, "boord", "active");
    const other = await seedFarm(db);
    const staffToken = await signStaffSession({ farmMembershipId: membership.id, farmId: farm.id, role: "admin" }, deps.env.staffSessionSecret);

    const add = await app.inject({
      method: "POST",
      url: "/devices",
      headers: { authorization: `Bearer ${staffToken}` },
      payload: { personId: other.person.id, moduleCode: "boord" },
    });

    assert.equal(add.statusCode, 404);
  });
});

test("adding a device for an unlicensed module is rejected", async () => {
  await withTestDb(async (db) => {
    const { app, deps } = await buildTestApp(db);
    const { farm, person, membership } = await setupFarm(db, "boord", "active"); // licensed for boord, not kudde
    const staffToken = await signStaffSession({ farmMembershipId: membership.id, farmId: farm.id, role: "admin" }, deps.env.staffSessionSecret);

    const add = await app.inject({
      method: "POST",
      url: "/devices",
      headers: { authorization: `Bearer ${staffToken}` },
      payload: { personId: person.id, moduleCode: "kudde" },
    });

    assert.equal(add.statusCode, 403);
    assert.equal(add.json().error.code, "not_licensed");
  });
});

test("a licence pulled after printing fails the scan even though the QR was valid when printed", async () => {
  await withTestDb(async (db) => {
    const { app, deps } = await buildTestApp(db);
    const { farm, person, membership } = await setupFarm(db, "boord", "active");
    const staffToken = await signStaffSession({ farmMembershipId: membership.id, farmId: farm.id, role: "admin" }, deps.env.staffSessionSecret);

    const add = await app.inject({
      method: "POST",
      url: "/devices",
      headers: { authorization: `Bearer ${staffToken}` },
      payload: { personId: person.id, moduleCode: "boord" },
    });
    const pairingToken = add.json().pairingToken as { id: string; token: string };

    await db.update(entitlements).set({ status: "suspended" }).where(eq(entitlements.farmId, farm.id));

    const scan = await app.inject({ method: "POST", url: `/pair/${pairingToken.token}` });
    assert.equal(scan.statusCode, 403);
    assert.equal(scan.json().error.code, "not_licensed");
  });
});

test("a grace-status entitlement pairs successfully, same as active", async () => {
  await withTestDb(async (db) => {
    const { app, deps } = await buildTestApp(db);
    const { farm, person, membership } = await setupFarm(db, "veldnotas", "grace");
    const staffToken = await signStaffSession({ farmMembershipId: membership.id, farmId: farm.id, role: "admin" }, deps.env.staffSessionSecret);

    const add = await app.inject({
      method: "POST",
      url: "/devices",
      headers: { authorization: `Bearer ${staffToken}` },
      payload: { personId: person.id, moduleCode: "veldnotas" },
    });
    assert.equal(add.statusCode, 200);
    const pairingToken = add.json().pairingToken.token as string;

    const scan = await app.inject({ method: "POST", url: `/pair/${pairingToken}` });
    assert.equal(scan.statusCode, 200);
    assert.deepEqual(scan.json().modules, ["veldnotas"]);
  });
});

test("revoke empties a device's modules so the next ticket refresh comes back with none", async () => {
  await withTestDb(async (db) => {
    const { app, deps } = await buildTestApp(db);
    const { farm, person, membership } = await setupFarm(db, "boord", "active");
    const staffToken = await signStaffSession({ farmMembershipId: membership.id, farmId: farm.id, role: "admin" }, deps.env.staffSessionSecret);

    const add = await app.inject({
      method: "POST",
      url: "/devices",
      headers: { authorization: `Bearer ${staffToken}` },
      payload: { personId: person.id, moduleCode: "boord" },
    });
    const deviceId = add.json().device.id as string;
    const pairingToken = add.json().pairingToken.token as string;

    const scan = await app.inject({ method: "POST", url: `/pair/${pairingToken}` });
    const ticket = scan.json().ticket as string;

    const revoke = await app.inject({
      method: "POST",
      url: `/devices/${deviceId}/revoke`,
      headers: { authorization: `Bearer ${staffToken}` },
    });
    assert.equal(revoke.statusCode, 200);
    assert.deepEqual(revoke.json().revokedModules, ["boord"]);

    const refresh = await app.inject({ method: "POST", url: "/tickets/refresh", headers: { authorization: `Bearer ${ticket}` } });
    assert.equal(refresh.statusCode, 200);

    const claims = await verifyTicket(refresh.json().ticket, deps.keys.publicKey);
    assert.deepEqual(claims.modules, []);
  });
});
