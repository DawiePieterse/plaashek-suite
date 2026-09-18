import assert from "node:assert/strict";
import test from "node:test";
import { blocks, harvestEvents, people, seasons } from "@plaashek/schema";
import { and, eq } from "drizzle-orm";
import { signStaffSession } from "../auth/staff-jwt.js";
import type { Db } from "../db.js";
import { buildTestApp } from "../test/app.js";
import { withTestDb } from "../test/db.js";
import { pairedPhone, ticketFor } from "../test/fixtures.js";

/** A farm mid-pick: an active season, a block, and a Boord phone at the scale. */
async function pickingFarm(db: Db) {
  const { farm, person, membership, device } = await pairedPhone(db, "boord");
  const [block] = await db.insert(blocks).values({ farmId: farm.id, name: "Blok A" }).returning();
  const [season] = await db
    .insert(seasons)
    .values({ farmId: farm.id, name: "Lietsjie 2026", startsOn: "2026-09-01", endsOn: "2026-12-31", isActive: true })
    .returning();

  return { farm, person, membership, block, season, device };
}

const staffToken = (farm: { id: string }, membership: { id: string }, secret: string, role: "admin" | "owner" = "admin") =>
  signStaffSession({ farmMembershipId: membership.id, farmId: farm.id, role }, secret);

/** The office types the number; every test that needs a picker starts here. */
async function registerWorker(app: Awaited<ReturnType<typeof buildTestApp>>["app"], token: string, workerNumber: string, name: string) {
  const response = await app.inject({
    method: "POST",
    url: "/piecework/workers",
    headers: { authorization: `Bearer ${token}` },
    payload: { workerNumber, name },
  });

  return { response, person: (response.json() as { person?: { id: string; kind: string; workerNumber: string } }).person };
}

test("a seasonal worker is registered under the number the office typed", async () => {
  await withTestDb(async (db) => {
    const { app, deps } = await buildTestApp(db);
    const { farm, membership } = await pickingFarm(db);
    const token = await staffToken(farm, membership, deps.env.staffSessionSecret);

    // Typed with a stray space and lower case, as it would be off a payslip.
    const { response, person } = await registerWorker(app, token, " emp-014 ", "Sara Sithole");

    assert.equal(response.statusCode, 200);
    assert.equal(person!.workerNumber, "EMP014");
    assert.equal(person!.kind, "seasonal");

    // Seasonal people stay out of the device-assignment list the office picks from.
    const farmResponse = await app.inject({ method: "GET", url: "/farm", headers: { authorization: `Bearer ${token}` } });
    const names = (farmResponse.json() as { people: { name: string }[] }).people.map((p) => p.name);
    assert.equal(names.includes("Sara Sithole"), false);
  });
});

test("two workers cannot hold the same number", async () => {
  await withTestDb(async (db) => {
    const { app, deps } = await buildTestApp(db);
    const { farm, membership } = await pickingFarm(db);
    const token = await staffToken(farm, membership, deps.env.staffSessionSecret);

    await registerWorker(app, token, "14", "Sara Sithole");
    const { response } = await registerWorker(app, token, "14", "Piet Plaas");

    assert.equal(response.statusCode, 409);
    assert.equal(response.json().error.code, "worker_number_taken");
  });
});

test("the same number on another farm is a different worker", async () => {
  await withTestDb(async (db) => {
    const { app, deps } = await buildTestApp(db);
    const { farm, membership } = await pickingFarm(db);
    const other = await pickingFarm(db);

    await registerWorker(app, await staffToken(farm, membership, deps.env.staffSessionSecret), "14", "Sara Sithole");
    const { response } = await registerWorker(app, await staffToken(other.farm, other.membership, deps.env.staffSessionSecret), "14", "Someone Else");

    assert.equal(response.statusCode, 200);
  });
});

test("a worker's name, number and standing can be edited", async () => {
  await withTestDb(async (db) => {
    const { app, deps } = await buildTestApp(db);
    const { farm, membership } = await pickingFarm(db);
    const token = await staffToken(farm, membership, deps.env.staffSessionSecret);
    const { person } = await registerWorker(app, token, "14", "Sara Sithol");

    const fixed = await app.inject({
      method: "PATCH",
      url: `/piecework/workers/${person!.id}`,
      headers: { authorization: `Bearer ${token}` },
      payload: { name: "Sara Sithole", workerNumber: "015", active: false },
    });

    assert.equal(fixed.statusCode, 200);
    const [row] = await db.select().from(people).where(eq(people.id, person!.id));
    assert.equal(row.name, "Sara Sithole");
    assert.equal(row.workerNumber, "015");
    assert.equal(row.active, false);
  });
});

test("an edit cannot take a number another worker already holds", async () => {
  await withTestDb(async (db) => {
    const { app, deps } = await buildTestApp(db);
    const { farm, membership } = await pickingFarm(db);
    const token = await staffToken(farm, membership, deps.env.staffSessionSecret);
    await registerWorker(app, token, "14", "Sara Sithole");
    const { person } = await registerWorker(app, token, "15", "Piet Plaas");

    const clash = await app.inject({
      method: "PATCH",
      url: `/piecework/workers/${person!.id}`,
      headers: { authorization: `Bearer ${token}` },
      payload: { workerNumber: "14" },
    });

    assert.equal(clash.statusCode, 409);
  });
});

test("keeping your own number on an edit is not a clash", async () => {
  await withTestDb(async (db) => {
    const { app, deps } = await buildTestApp(db);
    const { farm, membership } = await pickingFarm(db);
    const token = await staffToken(farm, membership, deps.env.staffSessionSecret);
    const { person } = await registerWorker(app, token, "14", "Sara Sithol");

    const fixed = await app.inject({
      method: "PATCH",
      url: `/piecework/workers/${person!.id}`,
      headers: { authorization: `Bearer ${token}` },
      payload: { workerNumber: "14", name: "Sara Sithole" },
    });

    assert.equal(fixed.statusCode, 200);
  });
});

test("importing a payroll file adds new workers and updates the ones the farm already has", async () => {
  await withTestDb(async (db) => {
    const { app, deps } = await buildTestApp(db);
    const { farm, membership } = await pickingFarm(db);
    const token = await staffToken(farm, membership, deps.env.staffSessionSecret);
    await registerWorker(app, token, "14", "Sara Sithol");

    const csv = [
      "Worker Number,Name,Active",
      "14,Sara Sithole,yes", // the number the office already has, with the name corrected
      "15,Piet Plaas,yes",
      "16,Jan Jantjies,no",
      ",Nobody,yes", // no number
      "17,,yes", // no name
      "15,Piet Again,yes", // the same number twice in one file
      "014,Leading Zero,yes", // "014" is not "14" — a payroll number keeps its zeros
    ].join("\r\n");

    const response = await app.inject({
      method: "POST",
      url: "/piecework/workers/import",
      headers: { authorization: `Bearer ${token}`, "content-type": "text/csv" },
      payload: csv,
    });

    assert.equal(response.statusCode, 200);
    const body = response.json() as { created: number; updated: number; skipped: { row: number; reason: string }[] };
    assert.equal(body.created, 3);
    assert.equal(body.updated, 1);
    assert.deepEqual(
      body.skipped.map((skip) => [skip.row, skip.reason]),
      [
        [5, "no_number"],
        [6, "no_name"],
        [7, "duplicate_number"],
      ],
    );

    const register = await app.inject({ method: "GET", url: "/piecework/workers", headers: { authorization: `Bearer ${token}` } });
    const workers = (register.json() as { workers: { workerNumber: string; name: string; active: boolean }[] }).workers;
    assert.deepEqual(
      workers.map((worker) => [worker.workerNumber, worker.name, worker.active]),
      [
        ["014", "Leading Zero", true],
        ["14", "Sara Sithole", true],
        ["15", "Piet Plaas", true],
        ["16", "Jan Jantjies", false],
      ],
    );
  });
});

test("the register goes out as CSV the payment system can read back", async () => {
  await withTestDb(async (db) => {
    const { app, deps } = await buildTestApp(db);
    const { farm, membership } = await pickingFarm(db);
    const token = await staffToken(farm, membership, deps.env.staffSessionSecret);
    await registerWorker(app, token, "14", "Sara Sithole");

    const response = await app.inject({ method: "GET", url: "/export/workers.csv", headers: { authorization: `Bearer ${token}` } });

    assert.equal(response.statusCode, 200);
    const lines = response.body.split("\r\n").filter((line) => line !== "");
    assert.equal(lines[0], "\ufeffworker_number,name,active");
    assert.equal(lines[1], "14,Sara Sithole,yes");
  });
});

test("a scanned number attributes the crate to its picker, not to the device's person", async () => {
  await withTestDb(async (db) => {
    const { app, deps } = await buildTestApp(db);
    const { farm, person, membership, block, season, device } = await pickingFarm(db);
    const staff = await staffToken(farm, membership, deps.env.staffSessionSecret);

    const { person: picker } = await registerWorker(app, staff, "EMP-014", "Sara Sithole");
    const ticket = await ticketFor(deps, farm, device, ["boord"], { seasonId: season.id });

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
            // Typed off the card, lower case with a stray hyphen — normalised both sides.
            payload: { block_id: block.id, weight_kg: 18.5, picker_card_code: " emp-014 " },
          },
        ],
      },
    });

    assert.equal(upload.statusCode, 200);
    const [row] = await db.select().from(harvestEvents).where(eq(harvestEvents.farmId, farm.id));
    assert.equal(row.pickerId, picker!.id);
    assert.equal(row.pickerCardCode, "EMP014");
    // The supervisor's device still stamps who captured it.
    assert.equal(row.createdBy, person.id);
  });
});

test("a number the server does not know keeps the crate and the number, unattributed", async () => {
  await withTestDb(async (db) => {
    const { app, deps } = await buildTestApp(db);
    const { farm, membership, block, season, device } = await pickingFarm(db);
    const ticket = await ticketFor(deps, farm, device, ["boord"], { seasonId: season.id });

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

test("a worker who has left stops collecting crates", async () => {
  await withTestDb(async (db) => {
    const { app, deps } = await buildTestApp(db);
    const { farm, membership, block, season, device } = await pickingFarm(db);
    const staff = await staffToken(farm, membership, deps.env.staffSessionSecret);

    const { person: picker } = await registerWorker(app, staff, "14", "Sara Sithole");

    // They have left: the office marks them inactive rather than deleting them.
    await app.inject({
      method: "PATCH",
      url: `/piecework/workers/${picker!.id}`,
      headers: { authorization: `Bearer ${staff}` },
      payload: { active: false },
    });

    const ticket = await ticketFor(deps, farm, device, ["boord"], { seasonId: season.id });

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
            payload: { block_id: block.id, weight_kg: 9, picker_card_code: "14" },
          },
        ],
      },
    });

    const [row] = await db.select().from(harvestEvents).where(eq(harvestEvents.farmId, farm.id));
    assert.equal(row.pickerId, null);
    // The number that was scanned is still on the crate for the office to place.
    assert.equal(row.pickerCardCode, "14");
    assert.equal((await db.select().from(people).where(and(eq(people.id, picker!.id), eq(people.kind, "seasonal")))).length, 1);
  });
});

test("the payout prices each picker's day against the tier in force", async () => {
  await withTestDb(async (db) => {
    const { app, deps } = await buildTestApp(db);
    const { farm, person, membership, block, season, device } = await pickingFarm(db);
    const staff = await staffToken(farm, membership, deps.env.staffSessionSecret);

    const { person: picker } = await registerWorker(app, staff, "14", "Sara Sithole");

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
        pickerId: picker!.id,
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
        pickerId: picker!.id,
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
    assert.deepEqual(body.people, [{ personId: picker!.id, personName: "Sara Sithole", kg: 120, days: 1, cents: 100 * 250 + 20 * 400, unratedKg: 0 }]);
    assert.equal(body.unattributedCrates, 1);
    assert.equal(body.unattributedKg, 8);
  });
});

test("the payout window can be narrowed to a pay week", async () => {
  await withTestDb(async (db) => {
    const { app, deps } = await buildTestApp(db);
    const { farm, person, membership, block, season, device } = await pickingFarm(db);
    const staff = await staffToken(farm, membership, deps.env.staffSessionSecret);

    const { person: picker } = await registerWorker(app, staff, "14", "Sara Sithole");

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
      pickerId: picker!.id,
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

test("the phone's register carries only this farm's active pickers", async () => {
  await withTestDb(async (db) => {
    const { app, deps } = await buildTestApp(db);
    const { farm, membership, device, season } = await pickingFarm(db);
    const staff = await staffToken(farm, membership, deps.env.staffSessionSecret);
    const other = await pickingFarm(db);

    await registerWorker(app, staff, "14", "Sara Sithole");
    const { person: gone } = await registerWorker(app, staff, "15", "Piet Plaas");
    await app.inject({
      method: "PATCH",
      url: `/piecework/workers/${gone!.id}`,
      headers: { authorization: `Bearer ${staff}` },
      payload: { active: false },
    });

    const otherStaff = await staffToken(other.farm, other.membership, deps.env.staffSessionSecret);
    await registerWorker(app, otherStaff, "14", "Other Farm Picker");

    const ticket = await ticketFor(deps, farm, device, ["boord"], { seasonId: season.id });

    const response = await app.inject({ method: "GET", url: "/pickers", headers: { authorization: `Bearer ${ticket}` } });

    assert.equal(response.statusCode, 200);
    assert.deepEqual(
      (response.json() as { pickers: { workerNumber: string; personName: string }[] }).pickers.map((row) => [row.workerNumber, row.personName]),
      [["14", "Sara Sithole"]],
    );
  });
});
