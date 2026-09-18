import assert from "node:assert/strict";
import test from "node:test";
import { blocks, deviceAssignments, deviceModules, devices, entitlements, harvestEvents, people, seasons, workerCards } from "@plaashek/schema";
import { mintTicket } from "@plaashek/tickets";
import { and, eq } from "drizzle-orm";
import { signStaffSession } from "../auth/staff-jwt.js";
import type { Db } from "../db.js";
import { buildTestApp } from "../test/app.js";
import { withTestDb } from "../test/db.js";
import { seedFarm } from "../test/fixtures.js";

/** A farm mid-pick: an active season, a block, and a Boord phone at the scale. */
async function pickingFarm(db: Db) {
  const { farm, person, membership } = await seedFarm(db);
  await db.insert(entitlements).values({ farmId: farm.id, moduleCode: "boord", status: "active" });
  const [block] = await db.insert(blocks).values({ farmId: farm.id, name: "Blok A" }).returning();
  const [season] = await db
    .insert(seasons)
    .values({ farmId: farm.id, name: "Lietsjie 2026", startsOn: "2026-09-01", endsOn: "2026-12-31", isActive: true })
    .returning();

  const [device] = await db.insert(devices).values({ farmId: farm.id, label: "Skaal" }).returning();
  await db.insert(deviceModules).values({ deviceId: device.id, moduleCode: "boord" });
  await db
    .insert(deviceAssignments)
    .values({ deviceId: device.id, personId: person.id, assignedBy: membership.id, assignedAt: new Date("2026-01-01T00:00:00Z") });

  return { farm, person, membership, block, season, device };
}

const staffToken = (farm: { id: string }, membership: { id: string }, secret: string, role: "admin" | "owner" = "admin") =>
  signStaffSession({ farmMembershipId: membership.id, farmId: farm.id, role }, secret);

test("registering a seasonal worker creates the person and their first card", async () => {
  await withTestDb(async (db) => {
    const { app, deps } = await buildTestApp(db);
    const { farm, membership } = await pickingFarm(db);
    const token = await staffToken(farm, membership, deps.env.staffSessionSecret);

    const response = await app.inject({
      method: "POST",
      url: "/piecework/workers",
      headers: { authorization: `Bearer ${token}` },
      payload: { name: "Sara Sithole" },
    });

    assert.equal(response.statusCode, 200);
    const body = response.json() as { person: { id: string; kind: string }; card: { code: string } };
    assert.equal(body.person.kind, "seasonal");
    assert.match(body.card.code, /^[0-9A-Z]{8}$/);

    // Seasonal people stay out of the device-assignment list the office picks from.
    const farmResponse = await app.inject({ method: "GET", url: "/farm", headers: { authorization: `Bearer ${token}` } });
    const names = (farmResponse.json() as { people: { name: string }[] }).people.map((p) => p.name);
    assert.equal(names.includes("Sara Sithole"), false);
  });
});

test("reissuing a card revokes the old one and mints a new code", async () => {
  await withTestDb(async (db) => {
    const { app, deps } = await buildTestApp(db);
    const { farm, membership } = await pickingFarm(db);
    const token = await staffToken(farm, membership, deps.env.staffSessionSecret);

    const registered = await app.inject({
      method: "POST",
      url: "/piecework/workers",
      headers: { authorization: `Bearer ${token}` },
      payload: { name: "Sara Sithole" },
    });
    const { person, card } = registered.json() as { person: { id: string }; card: { code: string } };

    const reissued = await app.inject({
      method: "POST",
      url: `/piecework/workers/${person.id}/card`,
      headers: { authorization: `Bearer ${token}` },
    });

    assert.equal(reissued.statusCode, 200);
    const fresh = (reissued.json() as { card: { code: string } }).card;
    assert.notEqual(fresh.code, card.code);

    const cards = await db.select().from(workerCards).where(eq(workerCards.personId, person.id));
    assert.equal(cards.length, 2);
    assert.equal(cards.filter((row) => row.revokedAt === null).length, 1);
  });
});

test("a scanned card attributes the crate to its picker, not to the device's person", async () => {
  await withTestDb(async (db) => {
    const { app, deps } = await buildTestApp(db);
    const { farm, person, membership, block, season, device } = await pickingFarm(db);
    const staff = await staffToken(farm, membership, deps.env.staffSessionSecret);

    const registered = await app.inject({
      method: "POST",
      url: "/piecework/workers",
      headers: { authorization: `Bearer ${staff}` },
      payload: { name: "Sara Sithole" },
    });
    const { person: picker, card } = registered.json() as { person: { id: string }; card: { code: string } };

    const ticket = await mintTicket({
      farmId: farm.id,
      deviceId: device.id,
      farmModules: ["boord"],
      deviceModules: ["boord"],
      language: "af",
      seasonId: season.id,
      signingKey: deps.keys.privateKey,
    });

    const upload = await app.inject({
      method: "POST",
      url: "/sync/upload",
      headers: { authorization: `Bearer ${ticket}` },
      payload: {
        ops: [
          {
            entity: "harvest_events",
            entity_id: crypto.randomUUID(),
            client_time: "2026-09-10T07:30:00.000Z",
            season_id: season.id,
            // Typed off the card, lower case with a stray space — normalised both sides.
            payload: { block_id: block.id, weight_kg: 18.5, picker_card_code: ` ${card.code.toLowerCase()} ` },
          },
        ],
      },
    });

    assert.equal(upload.statusCode, 200);
    const [row] = await db.select().from(harvestEvents).where(eq(harvestEvents.farmId, farm.id));
    assert.equal(row.pickerId, picker.id);
    assert.equal(row.pickerCardCode, card.code);
    // The supervisor's device still stamps who captured it.
    assert.equal(row.createdBy, person.id);
  });
});

test("a card the server does not know keeps the crate and the code, unattributed", async () => {
  await withTestDb(async (db) => {
    const { app, deps } = await buildTestApp(db);
    const { farm, membership, block, season, device } = await pickingFarm(db);
    const ticket = await mintTicket({
      farmId: farm.id,
      deviceId: device.id,
      farmModules: ["boord"],
      deviceModules: ["boord"],
      language: "af",
      seasonId: season.id,
      signingKey: deps.keys.privateKey,
    });

    const upload = await app.inject({
      method: "POST",
      url: "/sync/upload",
      headers: { authorization: `Bearer ${ticket}` },
      payload: {
        ops: [
          {
            entity: "harvest_events",
            entity_id: crypto.randomUUID(),
            client_time: "2026-09-10T07:30:00.000Z",
            season_id: season.id,
            payload: { block_id: block.id, weight_kg: 12, picker_card_code: "ZZZZ9999" },
          },
        ],
      },
    });

    assert.equal(upload.statusCode, 200);
    const [row] = await db.select().from(harvestEvents).where(eq(harvestEvents.farmId, farm.id));
    assert.equal(row.pickerId, null);
    assert.equal(row.pickerCardCode, "ZZZZ9999");

    const staff = await staffToken(farm, membership, deps.env.staffSessionSecret);
    const waiting = await app.inject({ method: "GET", url: "/piecework/unattributed", headers: { authorization: `Bearer ${staff}` } });
    assert.equal((waiting.json() as { crates: unknown[] }).crates.length, 1);
  });
});

test("a revoked card stops attributing crates", async () => {
  await withTestDb(async (db) => {
    const { app, deps } = await buildTestApp(db);
    const { farm, membership, block, season, device } = await pickingFarm(db);
    const staff = await staffToken(farm, membership, deps.env.staffSessionSecret);

    const registered = await app.inject({
      method: "POST",
      url: "/piecework/workers",
      headers: { authorization: `Bearer ${staff}` },
      payload: { name: "Sara Sithole" },
    });
    const { person: picker, card } = registered.json() as { person: { id: string }; card: { id: string; code: string } };

    await app.inject({ method: "POST", url: `/piecework/cards/${card.id}/revoke`, headers: { authorization: `Bearer ${staff}` } });

    const ticket = await mintTicket({
      farmId: farm.id,
      deviceId: device.id,
      farmModules: ["boord"],
      deviceModules: ["boord"],
      language: "af",
      seasonId: season.id,
      signingKey: deps.keys.privateKey,
    });

    await app.inject({
      method: "POST",
      url: "/sync/upload",
      headers: { authorization: `Bearer ${ticket}` },
      payload: {
        ops: [
          {
            entity: "harvest_events",
            entity_id: crypto.randomUUID(),
            client_time: "2026-09-10T07:30:00.000Z",
            season_id: season.id,
            payload: { block_id: block.id, weight_kg: 9, picker_card_code: card.code },
          },
        ],
      },
    });

    const [row] = await db.select().from(harvestEvents).where(eq(harvestEvents.farmId, farm.id));
    assert.equal(row.pickerId, null);
    assert.equal(row.pickerCardCode, card.code);
    assert.equal((await db.select().from(people).where(and(eq(people.id, picker.id), eq(people.kind, "seasonal")))).length, 1);
  });
});

test("the payout prices each picker's day against the tier in force", async () => {
  await withTestDb(async (db) => {
    const { app, deps } = await buildTestApp(db);
    const { farm, person, membership, block, season, device } = await pickingFarm(db);
    const staff = await staffToken(farm, membership, deps.env.staffSessionSecret);

    const registered = await app.inject({
      method: "POST",
      url: "/piecework/workers",
      headers: { authorization: `Bearer ${staff}` },
      payload: { name: "Sara Sithole" },
    });
    const { person: picker } = registered.json() as { person: { id: string } };

    const rate = await app.inject({
      method: "POST",
      url: "/piece-rates",
      headers: { authorization: `Bearer ${staff}` },
      payload: { effectiveFrom: "2026-09-01", baseCentsPerKg: 250, targetKg: 100, bonusCentsPerKg: 400 },
    });
    assert.equal(rate.statusCode, 200);

    // 120 kg in one day: 100 at base, 20 at bonus.
    await db.insert(harvestEvents).values([
      {
        farmId: farm.id,
        moduleCode: "boord",
        seasonId: season.id,
        createdBy: person.id,
        deviceId: device.id,
        blockId: block.id,
        pickerId: picker.id,
        weightKg: 70,
        createdAt: new Date("2026-09-10T06:00:00Z"),
      },
      {
        farmId: farm.id,
        moduleCode: "boord",
        seasonId: season.id,
        createdBy: person.id,
        deviceId: device.id,
        blockId: block.id,
        pickerId: picker.id,
        weightKg: 52,
        deductionKg: 2,
        createdAt: new Date("2026-09-10T11:00:00Z"),
      },
      // Nobody's yet — counted separately, never priced.
      {
        farmId: farm.id,
        moduleCode: "boord",
        seasonId: season.id,
        createdBy: person.id,
        deviceId: device.id,
        blockId: block.id,
        weightKg: 8,
        pickerCardCode: "ZZZZ9999",
        createdAt: new Date("2026-09-10T11:30:00Z"),
      },
    ]);

    const payout = await app.inject({ method: "GET", url: "/piecework/payout", headers: { authorization: `Bearer ${staff}` } });

    assert.equal(payout.statusCode, 200);
    const body = payout.json() as {
      people: { personName: string; kg: number; days: number; cents: number }[];
      unattributedCrates: number;
      unattributedKg: number;
    };
    assert.deepEqual(body.people, [{ personId: picker.id, personName: "Sara Sithole", kg: 120, days: 1, cents: 100 * 250 + 20 * 400, unratedKg: 0 }]);
    assert.equal(body.unattributedCrates, 1);
    assert.equal(body.unattributedKg, 8);
  });
});

test("the payout window can be narrowed to a pay week", async () => {
  await withTestDb(async (db) => {
    const { app, deps } = await buildTestApp(db);
    const { farm, person, membership, block, season, device } = await pickingFarm(db);
    const staff = await staffToken(farm, membership, deps.env.staffSessionSecret);

    const registered = await app.inject({
      method: "POST",
      url: "/piecework/workers",
      headers: { authorization: `Bearer ${staff}` },
      payload: { name: "Sara Sithole" },
    });
    const { person: picker } = registered.json() as { person: { id: string } };

    await app.inject({
      method: "POST",
      url: "/piece-rates",
      headers: { authorization: `Bearer ${staff}` },
      payload: { effectiveFrom: "2026-09-01", baseCentsPerKg: 200 },
    });

    const crate = (at: string, weightKg: number) => ({
      farmId: farm.id,
      moduleCode: "boord",
      seasonId: season.id,
      createdBy: person.id,
      deviceId: device.id,
      blockId: block.id,
      pickerId: picker.id,
      weightKg,
      createdAt: new Date(at),
    });
    await db.insert(harvestEvents).values([crate("2026-09-07T06:00:00Z", 10), crate("2026-09-14T06:00:00Z", 30)]);

    const week = await app.inject({
      method: "GET",
      url: "/piecework/payout?from=2026-09-14&to=2026-09-20",
      headers: { authorization: `Bearer ${staff}` },
    });

    const body = week.json() as { from: string; to: string; people: { kg: number; cents: number }[] };
    assert.equal(body.from, "2026-09-14");
    assert.deepEqual(
      body.people.map(({ kg, cents }) => ({ kg, cents })),
      [{ kg: 30, cents: 30 * 200 }],
    );
  });
});

test("a rate with a target but no bonus is refused — half a tier cannot be applied", async () => {
  await withTestDb(async (db) => {
    const { app, deps } = await buildTestApp(db);
    const { farm, membership } = await pickingFarm(db);
    const staff = await staffToken(farm, membership, deps.env.staffSessionSecret);

    const response = await app.inject({
      method: "POST",
      url: "/piece-rates",
      headers: { authorization: `Bearer ${staff}` },
      payload: { effectiveFrom: "2026-09-01", baseCentsPerKg: 250, targetKg: 100 },
    });

    assert.equal(response.statusCode, 400);
  });
});

test("the phone's card list carries only live cards for its own farm", async () => {
  await withTestDb(async (db) => {
    const { app, deps } = await buildTestApp(db);
    const { farm, membership, device, season } = await pickingFarm(db);
    const staff = await staffToken(farm, membership, deps.env.staffSessionSecret);
    const other = await pickingFarm(db);

    const registered = await app.inject({
      method: "POST",
      url: "/piecework/workers",
      headers: { authorization: `Bearer ${staff}` },
      payload: { name: "Sara Sithole" },
    });
    const { card } = registered.json() as { card: { id: string; code: string } };

    const otherStaff = await staffToken(other.farm, other.membership, deps.env.staffSessionSecret);
    await app.inject({
      method: "POST",
      url: "/piecework/workers",
      headers: { authorization: `Bearer ${otherStaff}` },
      payload: { name: "Other Farm Picker" },
    });

    const ticket = await mintTicket({
      farmId: farm.id,
      deviceId: device.id,
      farmModules: ["boord"],
      deviceModules: ["boord"],
      language: "af",
      seasonId: season.id,
      signingKey: deps.keys.privateKey,
    });

    const response = await app.inject({ method: "GET", url: "/worker-cards", headers: { authorization: `Bearer ${ticket}` } });

    assert.equal(response.statusCode, 200);
    assert.deepEqual(
      (response.json() as { cards: { code: string; personName: string }[] }).cards.map((row) => [row.code, row.personName]),
      [[card.code, "Sara Sithole"]],
    );
  });
});
