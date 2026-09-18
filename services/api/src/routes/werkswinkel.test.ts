import assert from "node:assert/strict";
import test from "node:test";
import { assets, workOrders } from "@plaashek/schema";
import { signStaffSession } from "../auth/staff-jwt.js";
import { buildTestApp } from "../test/app.js";
import { withTestDb } from "../test/db.js";
import { pairedPhone, seedFarm, ticketFor } from "../test/fixtures.js";

test("GET /assets gives a paired phone the farm's assets", async () => {
  await withTestDb(async (db) => {
    const { app, deps } = await buildTestApp(db);
    const { farm, device } = await pairedPhone(db, "werkswinkel");
    await db.insert(assets).values([
      { farmId: farm.id, name: "Trekker" },
      { farmId: farm.id, name: "Pakhuis" },
    ]);
    const ticket = await ticketFor(deps, farm, device, ["werkswinkel"]);

    const response = await app.inject({ method: "GET", url: "/assets", headers: { authorization: `Bearer ${ticket}` } });

    assert.equal(response.statusCode, 200);
    assert.deepEqual(
      response.json().assets.map((asset: { name: string }) => asset.name),
      ["Pakhuis", "Trekker"],
    );
  });
});

test("GET /work-orders/open (phone) shows a job any paired device can close, not just the one that opened it", async () => {
  await withTestDb(async (db) => {
    const { app, deps } = await buildTestApp(db);
    const { farm, person, device } = await pairedPhone(db, "werkswinkel");
    const [asset] = await db.insert(assets).values({ farmId: farm.id, name: "Trekker" }).returning();

    await db.insert(workOrders).values({
      farmId: farm.id,
      moduleCode: "werkswinkel",
      createdBy: person.id,
      deviceId: device.id,
      assetId: asset.id,
      event: "opened",
      description: "Band pap",
    });

    // A second phone, paired separately — closing does not require the same device.
    const secondTicket = await ticketFor(deps, farm, device, ["werkswinkel"]);
    const response = await app.inject({ method: "GET", url: "/work-orders/open", headers: { authorization: `Bearer ${secondTicket}` } });

    assert.equal(response.statusCode, 200);
    assert.equal(response.json().jobs.length, 1);
    assert.equal(response.json().jobs[0].description, "Band pap");
  });
});

test("GET /eienaar/werkswinkel groups open jobs by asset and leaves closed assets out", async () => {
  await withTestDb(async (db) => {
    const { app, deps } = await buildTestApp(db);
    const { farm, person, membership, device } = await pairedPhone(db, "werkswinkel");
    const [trekker] = await db.insert(assets).values({ farmId: farm.id, name: "Trekker" }).returning();
    const [pomp] = await db.insert(assets).values({ farmId: farm.id, name: "Waterpomp" }).returning();

    await db.insert(workOrders).values([
      { farmId: farm.id, moduleCode: "werkswinkel", createdBy: person.id, deviceId: device.id, assetId: trekker.id, event: "opened", description: "Band pap", createdAt: new Date("2026-06-01T04:00:00Z") },
      { farmId: farm.id, moduleCode: "werkswinkel", createdBy: person.id, deviceId: device.id, assetId: trekker.id, event: "closed", createdAt: new Date("2026-06-01T10:00:00Z") },
      { farmId: farm.id, moduleCode: "werkswinkel", createdBy: person.id, deviceId: device.id, assetId: pomp.id, event: "opened", description: "Pomp lek", createdAt: new Date("2026-06-02T04:00:00Z") },
    ]);

    const token = await signStaffSession({ farmMembershipId: membership.id, farmId: farm.id, role: "owner" }, deps.env.staffSessionSecret);
    const response = await app.inject({ method: "GET", url: "/eienaar/werkswinkel", headers: { authorization: `Bearer ${token}` } });

    assert.equal(response.statusCode, 200);
    // Trekker's job was closed, so only the pump — still open — shows up.
    assert.deepEqual(
      response.json().assets.map((a: { assetName: string }) => a.assetName),
      ["Waterpomp"],
    );
    assert.equal(response.json().assets[0].jobs[0].description, "Pomp lek");
  });
});
