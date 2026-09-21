import assert from "node:assert/strict";
import test from "node:test";
import { animals, camps, devices, movements, seasons, treatments, weights } from "@plaashek/schema";
import { mintTicket } from "@plaashek/tickets";
import { signStaffSession } from "../auth/staff-jwt.js";
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

test("POST /animals registers an animal under the office's own tag", async () => {
  await withTestDb(async (db) => {
    const { app, deps } = await buildTestApp(db);
    const { farm, membership } = await seedFarm(db);
    const token = await signStaffSession({ farmMembershipId: membership.id, farmId: farm.id, role: "admin" }, deps.env.staffSessionSecret);

    const response = await app.inject({
      method: "POST",
      url: "/animals",
      headers: { authorization: `Bearer ${token}` },
      payload: { tagNumber: "014", sex: "cow", breed: "Bonsmara" },
    });

    assert.equal(response.statusCode, 200);
    const { animal } = response.json();
    assert.equal(animal.tagNumber, "014");
    assert.equal(animal.sex, "cow");
    assert.equal(animal.breed, "Bonsmara");
    assert.equal(animal.active, true);
  });
});

test("POST /animals normalises the tag the same way a worker number is normalised", async () => {
  await withTestDb(async (db) => {
    const { app, deps } = await buildTestApp(db);
    const { farm, membership } = await seedFarm(db);
    const token = await signStaffSession({ farmMembershipId: membership.id, farmId: farm.id, role: "admin" }, deps.env.staffSessionSecret);

    const response = await app.inject({
      method: "POST",
      url: "/animals",
      headers: { authorization: `Bearer ${token}` },
      payload: { tagNumber: " b-1 ", sex: "bull" },
    });

    assert.equal(response.statusCode, 200);
    assert.equal(response.json().animal.tagNumber, "B1");
  });
});

test("POST /animals refuses a tag another animal on the farm already has", async () => {
  await withTestDb(async (db) => {
    const { app, deps } = await buildTestApp(db);
    const { farm, membership } = await seedFarm(db);
    await db.insert(animals).values({ farmId: farm.id, tagNumber: "014", sex: "cow" });
    const token = await signStaffSession({ farmMembershipId: membership.id, farmId: farm.id, role: "admin" }, deps.env.staffSessionSecret);

    const response = await app.inject({
      method: "POST",
      url: "/animals",
      headers: { authorization: `Bearer ${token}` },
      payload: { tagNumber: "014", sex: "bull" },
    });

    assert.equal(response.statusCode, 409);
    assert.equal(response.json().error.code, "tag_number_taken");
  });
});

test("PATCH /animals/:id marks a sold animal inactive without touching its history", async () => {
  await withTestDb(async (db) => {
    const { app, deps } = await buildTestApp(db);
    const { farm, membership } = await seedFarm(db);
    const [animal] = await db.insert(animals).values({ farmId: farm.id, tagNumber: "014", sex: "cow" }).returning();
    const token = await signStaffSession({ farmMembershipId: membership.id, farmId: farm.id, role: "admin" }, deps.env.staffSessionSecret);

    const response = await app.inject({
      method: "PATCH",
      url: `/animals/${animal.id}`,
      headers: { authorization: `Bearer ${token}` },
      payload: { active: false },
    });

    assert.equal(response.statusCode, 200);
    assert.equal(response.json().animal.active, false);
    assert.equal(response.json().animal.tagNumber, "014");
  });
});

test("GET /eienaar/kudde reports headcount per camp from each animal's latest movement, all-time", async () => {
  await withTestDb(async (db) => {
    const { app, deps } = await buildTestApp(db);
    const { farm, person, membership } = await seedFarm(db);
    const [device] = await db.insert(devices).values({ farmId: farm.id }).returning();
    const [campA, campB] = await db.insert(camps).values([{ farmId: farm.id, name: "Kamp A" }, { farmId: farm.id, name: "Kamp B" }]).returning();
    // The third animal is never moved (stays unplaced); the fourth is sold (inactive).
    const [cow, bull, , sold] = await db
      .insert(animals)
      .values([
        { farmId: farm.id, tagNumber: "001", sex: "cow" },
        { farmId: farm.id, tagNumber: "B1", sex: "bull" },
        { farmId: farm.id, tagNumber: "002", sex: "cow" },
        { farmId: farm.id, tagNumber: "099", sex: "cow", active: false },
      ])
      .returning();

    await db.insert(movements).values([
      // The cow moved twice — only the later row should count.
      { farmId: farm.id, moduleCode: "kudde", createdBy: person.id, deviceId: device.id, animalId: cow.id, toCampId: campA.id, createdAt: new Date("2026-06-01T08:00:00Z") },
      { farmId: farm.id, moduleCode: "kudde", createdBy: person.id, deviceId: device.id, animalId: cow.id, toCampId: campB.id, createdAt: new Date("2026-06-02T08:00:00Z") },
      { farmId: farm.id, moduleCode: "kudde", createdBy: person.id, deviceId: device.id, animalId: bull.id, toCampId: campB.id, createdAt: new Date("2026-06-01T08:00:00Z") },
      // A sold animal's old movement must not count toward a camp's live headcount.
      { farmId: farm.id, moduleCode: "kudde", createdBy: person.id, deviceId: device.id, animalId: sold.id, toCampId: campA.id, createdAt: new Date("2026-05-01T08:00:00Z") },
    ]);

    const token = await signStaffSession({ farmMembershipId: membership.id, farmId: farm.id, role: "owner" }, deps.env.staffSessionSecret);
    const response = await app.inject({ method: "GET", url: "/eienaar/kudde", headers: { authorization: `Bearer ${token}` } });

    assert.equal(response.statusCode, 200);
    const body = response.json() as { camps: { campName: string; headcount: number }[]; unplaced: number };
    assert.deepEqual(
      body.camps.map(({ campName, headcount }) => ({ campName, headcount })),
      [
        { campName: "Kamp B", headcount: 2 }, // the cow (moved on) and the bull
      ],
    );
    // The never-moved animal has no camp yet — reported, not silently dropped.
    assert.equal(body.unplaced, 1);
  });
});

test("GET /eienaar/kudde scopes treatments and weights to the active season, unlike headcount", async () => {
  await withTestDb(async (db) => {
    const { app, deps } = await buildTestApp(db);
    const { farm, person, membership } = await seedFarm(db);
    const [device] = await db.insert(devices).values({ farmId: farm.id }).returning();
    const [animal] = await db.insert(animals).values({ farmId: farm.id, tagNumber: "014", sex: "cow" }).returning();

    const [activeSeason, oldSeason] = await db
      .insert(seasons)
      .values([
        { farmId: farm.id, name: "Oes 2026/27", startsOn: "2026-11-01", endsOn: "2027-02-15", isActive: true },
        { farmId: farm.id, name: "Oes 2025/26", startsOn: "2025-11-01", endsOn: "2026-02-15" },
      ])
      .returning();

    await db.insert(treatments).values([
      { farmId: farm.id, moduleCode: "kudde", seasonId: activeSeason.id, createdBy: person.id, deviceId: device.id, animalId: animal.id, treatmentType: "Inenting" },
      { farmId: farm.id, moduleCode: "kudde", seasonId: oldSeason.id, createdBy: person.id, deviceId: device.id, animalId: animal.id, treatmentType: "Ou behandeling" },
    ]);
    await db.insert(weights).values([
      { farmId: farm.id, moduleCode: "kudde", seasonId: activeSeason.id, createdBy: person.id, deviceId: device.id, animalId: animal.id, weightKg: 412.5 },
      { farmId: farm.id, moduleCode: "kudde", seasonId: oldSeason.id, createdBy: person.id, deviceId: device.id, animalId: animal.id, weightKg: 380 },
    ]);

    const token = await signStaffSession({ farmMembershipId: membership.id, farmId: farm.id, role: "owner" }, deps.env.staffSessionSecret);
    const response = await app.inject({ method: "GET", url: "/eienaar/kudde", headers: { authorization: `Bearer ${token}` } });

    assert.equal(response.statusCode, 200);
    const body = response.json() as {
      treatments: { treatmentType: string; animalTag: string }[];
      weights: { weightKg: number; animalTag: string }[];
    };
    assert.deepEqual(
      body.treatments.map((t) => t.treatmentType),
      ["Inenting"],
    );
    assert.deepEqual(
      body.weights.map((w) => w.weightKg),
      [412.5],
    );
    assert.equal(body.treatments[0].animalTag, "014");
  });
});

test("GET /eienaar/kudde reports headcount even with no active season", async () => {
  await withTestDb(async (db) => {
    const { app, deps } = await buildTestApp(db);
    const { farm, person, membership } = await seedFarm(db);
    const [device] = await db.insert(devices).values({ farmId: farm.id }).returning();
    const [camp] = await db.insert(camps).values({ farmId: farm.id, name: "Kamp A" }).returning();
    const [animal] = await db.insert(animals).values({ farmId: farm.id, tagNumber: "014", sex: "cow" }).returning();

    await db.insert(movements).values({ farmId: farm.id, moduleCode: "kudde", createdBy: person.id, deviceId: device.id, animalId: animal.id, toCampId: camp.id });

    const token = await signStaffSession({ farmMembershipId: membership.id, farmId: farm.id, role: "owner" }, deps.env.staffSessionSecret);
    const response = await app.inject({ method: "GET", url: "/eienaar/kudde", headers: { authorization: `Bearer ${token}` } });

    assert.equal(response.statusCode, 200);
    const body = response.json() as { season: null; camps: { campName: string; headcount: number }[]; treatments: unknown[] };
    assert.equal(body.season, null);
    assert.deepEqual(body.camps, [{ campId: camp.id, campName: "Kamp A", headcount: 1 }]);
    assert.deepEqual(body.treatments, []);
  });
});
