import assert from "node:assert/strict";
import test from "node:test";
import { devices, seasons, stockItems, stockMoves } from "@plaashek/schema";
import { signStaffSession } from "../auth/staff-jwt.js";
import { buildTestApp } from "../test/app.js";
import { withTestDb } from "../test/db.js";
import { pairedPhone, seedFarm, ticketFor } from "../test/fixtures.js";

test("admin can add a stock item and edit it; the register is readable by admin and owner", async () => {
  await withTestDb(async (db) => {
    const { app, deps } = await buildTestApp(db);
    const { farm, membership } = await seedFarm(db);
    const adminToken = await signStaffSession({ farmMembershipId: membership.id, farmId: farm.id, role: "admin" }, deps.env.staffSessionSecret);
    const adminHeaders = { authorization: `Bearer ${adminToken}` };

    const created = await app.inject({ method: "POST", url: "/stock-items", headers: adminHeaders, payload: { name: "Glifosaat", unit: "L" } });
    assert.equal(created.statusCode, 200);
    const itemId = created.json().item.id;

    const edited = await app.inject({
      method: "PATCH",
      url: `/stock-items/${itemId}`,
      headers: adminHeaders,
      payload: { active: false },
    });
    assert.equal(edited.statusCode, 200);
    assert.equal(edited.json().item.active, false);
    // Renaming and re-unit'ing leave the id untouched — moves already logged keep pointing at the same item.
    assert.equal(edited.json().item.name, "Glifosaat");

    const ownerToken = await signStaffSession({ farmMembershipId: membership.id, farmId: farm.id, role: "owner" }, deps.env.staffSessionSecret);
    const list = await app.inject({ method: "GET", url: "/stock-items", headers: { authorization: `Bearer ${ownerToken}` } });
    assert.equal(list.statusCode, 200);
    assert.equal(list.json().items[0].active, false);

    // Owner cannot create one.
    const ownerCreate = await app.inject({
      method: "POST",
      url: "/stock-items",
      headers: { authorization: `Bearer ${ownerToken}` },
      payload: { name: "Kunsmis", unit: "kg" },
    });
    assert.equal(ownerCreate.statusCode, 403);
  });
});

test("a farm cannot edit another farm's stock item", async () => {
  await withTestDb(async (db) => {
    const { app, deps } = await buildTestApp(db);
    const mine = await seedFarm(db, { email: "mine@example.com" });
    const theirs = await seedFarm(db, { email: "theirs@example.com" });
    const [theirItem] = await db.insert(stockItems).values({ farmId: theirs.farm.id, name: "Hulle item", unit: "L" }).returning();

    const token = await signStaffSession({ farmMembershipId: mine.membership.id, farmId: mine.farm.id, role: "admin" }, deps.env.staffSessionSecret);
    const response = await app.inject({
      method: "PATCH",
      url: `/stock-items/${theirItem.id}`,
      headers: { authorization: `Bearer ${token}` },
      payload: { active: false },
    });

    assert.equal(response.statusCode, 404);
  });
});

test("GET /stock-catalog gives a paired phone only the active items", async () => {
  await withTestDb(async (db) => {
    const { app, deps } = await buildTestApp(db);
    const { farm, device } = await pairedPhone(db, "stoor");
    await db.insert(stockItems).values([
      { farmId: farm.id, name: "Glifosaat", unit: "L", active: true },
      { farmId: farm.id, name: "Ou voorraad", unit: "bag", active: false },
    ]);
    const ticket = await ticketFor(deps, farm, device, ["stoor"]);

    const response = await app.inject({ method: "GET", url: "/stock-catalog", headers: { authorization: `Bearer ${ticket}` } });

    assert.equal(response.statusCode, 200);
    assert.deepEqual(
      response.json().items.map((item: { name: string }) => item.name),
      ["Glifosaat"],
    );
  });
});

test("GET /eienaar/stock sums moves across every season, not just the active one", async () => {
  await withTestDb(async (db) => {
    const { app, deps } = await buildTestApp(db);
    const { farm, person, membership } = await seedFarm(db);
    const [device] = await db.insert(devices).values({ farmId: farm.id }).returning();
    const [item] = await db.insert(stockItems).values({ farmId: farm.id, name: "Glifosaat", unit: "L" }).returning();

    const [oldSeason] = await db.insert(seasons).values({ farmId: farm.id, name: "Oes 2025", startsOn: "2025-01-01", endsOn: "2025-12-31", isActive: false }).returning();
    const [activeSeason] = await db
      .insert(seasons)
      .values({ farmId: farm.id, name: "Oes 2026", startsOn: "2026-01-01", endsOn: "2026-12-31", isActive: true })
      .returning();

    await db.insert(stockMoves).values([
      { farmId: farm.id, moduleCode: "stoor", createdBy: person.id, deviceId: device.id, itemId: item.id, seasonId: oldSeason.id, direction: "in", quantity: 100 },
      { farmId: farm.id, moduleCode: "stoor", createdBy: person.id, deviceId: device.id, itemId: item.id, seasonId: oldSeason.id, direction: "out", quantity: 30 },
      { farmId: farm.id, moduleCode: "stoor", createdBy: person.id, deviceId: device.id, itemId: item.id, seasonId: activeSeason.id, direction: "out", quantity: 20 },
    ]);

    const token = await signStaffSession({ farmMembershipId: membership.id, farmId: farm.id, role: "owner" }, deps.env.staffSessionSecret);
    const response = await app.inject({ method: "GET", url: "/eienaar/stock", headers: { authorization: `Bearer ${token}` } });

    assert.equal(response.statusCode, 200);
    const [row] = response.json().items;
    assert.equal(row.itemId, item.id);
    // 100 in, 30 + 20 out across two seasons — a running total, not scoped to one.
    assert.equal(row.onHand, 50);
  });
});
