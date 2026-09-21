import assert from "node:assert/strict";
import test from "node:test";
import { blocks, devices, productRegistrations, sprayApplications, stockItems } from "@plaashek/schema";
import { signStaffSession } from "../auth/staff-jwt.js";
import { buildTestApp } from "../test/app.js";
import { withTestDb } from "../test/db.js";
import { pairedPhone, seedFarm, ticketFor } from "../test/fixtures.js";

test("admin can register a product against an existing stock item and edit it; owner can read but not create", async () => {
  await withTestDb(async (db) => {
    const { app, deps } = await buildTestApp(db);
    const { farm, membership } = await seedFarm(db);
    const [item] = await db.insert(stockItems).values({ farmId: farm.id, name: "GF 120", unit: "L" }).returning();
    const adminToken = await signStaffSession({ farmMembershipId: membership.id, farmId: farm.id, role: "admin" }, deps.env.staffSessionSecret);
    const adminHeaders = { authorization: `Bearer ${adminToken}` };

    const created = await app.inject({
      method: "POST",
      url: "/product-registrations",
      headers: adminHeaders,
      payload: { item_id: item.id, active_ingredient: "Spinosad", l_number: "L-7331", withholding_period: "1 dag" },
    });
    assert.equal(created.statusCode, 200);
    const registrationId = created.json().registration.id;

    const edited = await app.inject({
      method: "PATCH",
      url: `/product-registrations/${registrationId}`,
      headers: adminHeaders,
      payload: { withholding_period: "2 dae" },
    });
    assert.equal(edited.statusCode, 200);
    assert.equal(edited.json().registration.withholdingPeriod, "2 dae");

    const ownerToken = await signStaffSession({ farmMembershipId: membership.id, farmId: farm.id, role: "owner" }, deps.env.staffSessionSecret);
    const list = await app.inject({ method: "GET", url: "/product-registrations", headers: { authorization: `Bearer ${ownerToken}` } });
    assert.equal(list.statusCode, 200);
    assert.equal(list.json().registrations[0].itemName, "GF 120");

    const ownerCreate = await app.inject({
      method: "POST",
      url: "/product-registrations",
      headers: { authorization: `Bearer ${ownerToken}` },
      payload: { item_id: item.id, active_ingredient: "Should not save" },
    });
    assert.equal(ownerCreate.statusCode, 403);
  });
});

test("GET /spray-catalog gives a paired phone the registrations, keyed by item", async () => {
  await withTestDb(async (db) => {
    const { app, deps } = await buildTestApp(db);
    const { farm, device } = await pairedPhone(db, "bespuiting");
    const [item] = await db.insert(stockItems).values({ farmId: farm.id, name: "GF 120", unit: "L" }).returning();
    await db.insert(productRegistrations).values({
      farmId: farm.id,
      itemId: item.id,
      activeIngredient: "Spinosad",
      defaultReason: "Vrugtevlieg",
      withholdingPeriod: "1 dag",
    });
    const ticket = await ticketFor(deps, farm, device, ["bespuiting"]);

    const response = await app.inject({ method: "GET", url: "/spray-catalog", headers: { authorization: `Bearer ${ticket}` } });

    assert.equal(response.statusCode, 200);
    const [registration] = response.json().registrations;
    assert.equal(registration.itemId, item.id);
    assert.equal(registration.defaultReason, "Vrugtevlieg");
  });
});

test("GET /eienaar/bespuiting computes a safe-harvest date from a numeric withholding period, and none for a non-numeric one", async () => {
  await withTestDb(async (db) => {
    const { app, deps } = await buildTestApp(db);
    const { farm, person, membership } = await seedFarm(db);
    const [device] = await db.insert(devices).values({ farmId: farm.id }).returning();
    const [block] = await db.insert(blocks).values({ farmId: farm.id, name: "Blok 12" }).returning();
    const [timed] = await db.insert(stockItems).values({ farmId: farm.id, name: "GF 120", unit: "L" }).returning();
    const [untimed] = await db.insert(stockItems).values({ farmId: farm.id, name: "Springbok", unit: "L" }).returning();

    await db.insert(productRegistrations).values([
      { farmId: farm.id, itemId: timed.id, activeIngredient: "Spinosad", withholdingPeriod: "1 dag" },
      { farmId: farm.id, itemId: untimed.id, activeIngredient: "Glifosaat", withholdingPeriod: "Geen — nie op vrugte nie" },
    ]);

    await db.insert(sprayApplications).values([
      {
        farmId: farm.id,
        moduleCode: "bespuiting",
        createdBy: person.id,
        deviceId: device.id,
        blockId: block.id,
        itemId: timed.id,
        quantity: 2.4,
        createdAt: new Date("2026-09-20T00:00:00Z"),
      },
      {
        farmId: farm.id,
        moduleCode: "bespuiting",
        createdBy: person.id,
        deviceId: device.id,
        blockId: block.id,
        itemId: untimed.id,
        quantity: 18,
        createdAt: new Date("2026-09-21T00:00:00Z"),
      },
    ]);

    const token = await signStaffSession({ farmMembershipId: membership.id, farmId: farm.id, role: "owner" }, deps.env.staffSessionSecret);
    const response = await app.inject({ method: "GET", url: "/eienaar/bespuiting", headers: { authorization: `Bearer ${token}` } });

    assert.equal(response.statusCode, 200);
    const { applications } = response.json();
    assert.equal(applications.length, 2);

    const timedRow = applications.find((row: { item: string }) => row.item === "GF 120");
    assert.equal(timedRow.withholdingPeriod, "1 dag");
    assert.equal(timedRow.safeHarvestDate, "2026-09-21");

    const untimedRow = applications.find((row: { item: string }) => row.item === "Springbok");
    assert.equal(untimedRow.withholdingPeriod, "Geen — nie op vrugte nie");
    assert.equal(untimedRow.safeHarvestDate, null);
  });
});
