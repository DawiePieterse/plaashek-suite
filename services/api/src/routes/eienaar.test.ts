import assert from "node:assert/strict";
import test from "node:test";
import { attendancePunches, blocks, devices, harvestEvents, people, seasons } from "@plaashek/schema";
import { signStaffSession } from "../auth/staff-jwt.js";
import { buildTestApp } from "../test/app.js";
import { withTestDb } from "../test/db.js";
import { seedFarm } from "../test/fixtures.js";

test("GET /eienaar/harvest totals crates and kg by block for the active season only", async () => {
  await withTestDb(async (db) => {
    const { app, deps } = await buildTestApp(db);
    const { farm, person, membership } = await seedFarm(db);

    const [blockA, blockB] = await db.insert(blocks).values([{ farmId: farm.id, name: "Blok A" }, { farmId: farm.id, name: "Blok B" }]).returning();
    const [device] = await db.insert(devices).values({ farmId: farm.id }).returning();

    const [activeSeason] = await db
      .insert(seasons)
      .values({ farmId: farm.id, name: "Oes 2026/27", startsOn: "2026-11-01", endsOn: "2027-02-15", isActive: true })
      .returning();
    const [oldSeason] = await db
      .insert(seasons)
      .values({ farmId: farm.id, name: "Oes 2025/26", startsOn: "2025-11-01", endsOn: "2026-02-15" })
      .returning();

    await db.insert(harvestEvents).values([
      { farmId: farm.id, moduleCode: "boord", seasonId: activeSeason.id, createdBy: person.id, deviceId: device.id, blockId: blockA.id, weightKg: 10 },
      { farmId: farm.id, moduleCode: "boord", seasonId: activeSeason.id, createdBy: person.id, deviceId: device.id, blockId: blockA.id, weightKg: 5 },
      { farmId: farm.id, moduleCode: "boord", seasonId: activeSeason.id, createdBy: person.id, deviceId: device.id, blockId: blockB.id, weightKg: 20 },
      // Last season's crates must not bleed into this season's totals.
      { farmId: farm.id, moduleCode: "boord", seasonId: oldSeason.id, createdBy: person.id, deviceId: device.id, blockId: blockA.id, weightKg: 999 },
    ]);

    const token = await signStaffSession({ farmMembershipId: membership.id, farmId: farm.id, role: "owner" }, deps.env.staffSessionSecret);
    const response = await app.inject({ method: "GET", url: "/eienaar/harvest", headers: { authorization: `Bearer ${token}` } });

    assert.equal(response.statusCode, 200);
    const body = response.json() as { season: { name: string }; blocks: { blockName: string; crates: number; kg: number }[] };
    assert.equal(body.season.name, "Oes 2026/27");
    assert.deepEqual(
      body.blocks.map(({ blockName, crates, kg }) => ({ blockName, crates, kg })),
      [
        { blockName: "Blok A", crates: 2, kg: 15 },
        { blockName: "Blok B", crates: 1, kg: 20 },
      ],
    );
  });
});

test("GET /eienaar/harvest with no active season returns no rollup", async () => {
  await withTestDb(async (db) => {
    const { app, deps } = await buildTestApp(db);
    const { farm, membership } = await seedFarm(db);

    const token = await signStaffSession({ farmMembershipId: membership.id, farmId: farm.id, role: "admin" }, deps.env.staffSessionSecret);
    const response = await app.inject({ method: "GET", url: "/eienaar/harvest", headers: { authorization: `Bearer ${token}` } });

    assert.equal(response.statusCode, 200);
    assert.deepEqual(response.json(), { season: null, blocks: [] });
  });
});

test("GET /eienaar/attendance pairs punches into days and hours per person, active season only", async () => {
  await withTestDb(async (db) => {
    const { app, deps } = await buildTestApp(db);
    const { farm, person, membership } = await seedFarm(db);
    const [piet] = await db.insert(people).values({ farmId: farm.id, name: "Piet Plaas" }).returning();
    const [device] = await db.insert(devices).values({ farmId: farm.id }).returning();

    const [activeSeason] = await db
      .insert(seasons)
      .values({ farmId: farm.id, name: "Oes 2026/27", startsOn: "2026-11-01", endsOn: "2027-02-15", isActive: true })
      .returning();
    const [oldSeason] = await db
      .insert(seasons)
      .values({ farmId: farm.id, name: "Oes 2025/26", startsOn: "2025-11-01", endsOn: "2026-02-15" })
      .returning();

    const punch = (personId: string, direction: "in" | "out", at: string, seasonId = activeSeason.id) => ({
      farmId: farm.id,
      moduleCode: "span",
      seasonId,
      createdBy: personId,
      deviceId: device.id,
      direction,
      createdAt: new Date(at),
    });

    await db.insert(attendancePunches).values([
      punch(person.id, "in", "2026-11-02T04:00:00Z"),
      punch(person.id, "out", "2026-11-02T12:00:00Z"),
      // Forgot to clock out — open, never guessed at.
      punch(piet.id, "in", "2026-11-02T04:00:00Z"),
      // Last season's hours must not bleed into this season's rollup.
      punch(person.id, "in", "2026-01-02T04:00:00Z", oldSeason.id),
      punch(person.id, "out", "2026-01-02T23:00:00Z", oldSeason.id),
    ]);

    const token = await signStaffSession({ farmMembershipId: membership.id, farmId: farm.id, role: "owner" }, deps.env.staffSessionSecret);
    const response = await app.inject({ method: "GET", url: "/eienaar/attendance", headers: { authorization: `Bearer ${token}` } });

    assert.equal(response.statusCode, 200);
    const body = response.json() as { season: { name: string }; people: { personName: string; days: number; hours: number; openPunches: number }[] };
    assert.equal(body.season.name, "Oes 2026/27");
    assert.deepEqual(
      body.people.map(({ personName, days, hours, openPunches }) => ({ personName, days, hours, openPunches })),
      [
        { personName: "Person", days: 1, hours: 8, openPunches: 0 },
        { personName: "Piet Plaas", days: 0, hours: 0, openPunches: 1 },
      ],
    );
  });
});

test("GET /eienaar/attendance with no active season returns no rollup", async () => {
  await withTestDb(async (db) => {
    const { app, deps } = await buildTestApp(db);
    const { farm, membership } = await seedFarm(db);

    const token = await signStaffSession({ farmMembershipId: membership.id, farmId: farm.id, role: "admin" }, deps.env.staffSessionSecret);
    const response = await app.inject({ method: "GET", url: "/eienaar/attendance", headers: { authorization: `Bearer ${token}` } });

    assert.equal(response.statusCode, 200);
    assert.deepEqual(response.json(), { season: null, people: [] });
  });
});
