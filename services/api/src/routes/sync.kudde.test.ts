import assert from "node:assert/strict";
import test from "node:test";
import { animals, camps, movements, treatments, weights } from "@plaashek/schema";
import { eq } from "drizzle-orm";
import { buildTestApp } from "../test/app.js";
import { withTestDb } from "../test/db.js";
import { pairedPhone, ticketFor } from "../test/fixtures.js";

function movementOp(animalId: string, toCampId: string, extra: Record<string, unknown> = {}) {
  return {
    entity: "movements",
    entity_id: crypto.randomUUID(),
    client_time: "2026-06-01T04:12:00.000Z",
    season_id: null,
    payload: { animal_id: animalId, to_camp_id: toCampId, ...extra },
  };
}

function treatmentOp(animalId: string, treatmentType: string, extra: Record<string, unknown> = {}) {
  return {
    entity: "treatments",
    entity_id: crypto.randomUUID(),
    client_time: "2026-06-01T04:12:00.000Z",
    season_id: null,
    payload: { animal_id: animalId, treatment_type: treatmentType, ...extra },
  };
}

function weightOp(animalId: string, weightKg: number) {
  return {
    entity: "weights",
    entity_id: crypto.randomUUID(),
    client_time: "2026-06-01T04:12:00.000Z",
    season_id: null,
    payload: { animal_id: animalId, weight_kg: weightKg },
  };
}

test("a group move uploads as one row per animal, stamped with the device's assigned person", async () => {
  await withTestDb(async (db) => {
    const { app, deps } = await buildTestApp(db);
    const { farm, person, device } = await pairedPhone(db, "kudde");
    const [fromCamp] = await db.insert(camps).values({ farmId: farm.id, name: "Kamp 1" }).returning();
    const [toCamp] = await db.insert(camps).values({ farmId: farm.id, name: "Kamp 2" }).returning();
    const [cow] = await db.insert(animals).values({ farmId: farm.id, tagNumber: "014", sex: "cow" }).returning();
    const [bull] = await db.insert(animals).values({ farmId: farm.id, tagNumber: "B1", sex: "bull" }).returning();
    const ticket = await ticketFor(deps, farm, device, ["kudde"]);

    const response = await app.inject({
      method: "POST",
      url: "/sync/upload",
      headers: { authorization: `Bearer ${ticket}` },
      payload: {
        ops: [
          movementOp(cow.id, toCamp.id, { from_camp_id: fromCamp.id }),
          movementOp(bull.id, toCamp.id, { from_camp_id: fromCamp.id }),
        ],
      },
    });

    assert.equal(response.statusCode, 200);
    assert.equal(response.json().held, false);

    const rows = await db.select().from(movements).where(eq(movements.farmId, farm.id));
    assert.equal(rows.length, 2);
    assert.equal(rows[0].createdBy, person.id);
    assert.equal(rows[0].moduleCode, "kudde");
    assert.equal(rows[0].toCampId, toCamp.id);
    assert.equal(rows[0].fromCampId, fromCamp.id);
    assert.deepEqual(
      rows.map((row) => row.animalId).sort(),
      [cow.id, bull.id].sort(),
    );
  });
});

test("an animal's first movement has no from-camp", async () => {
  await withTestDb(async (db) => {
    const { app, deps } = await buildTestApp(db);
    const { farm, device } = await pairedPhone(db, "kudde");
    const [toCamp] = await db.insert(camps).values({ farmId: farm.id, name: "Kamp 2" }).returning();
    const [animal] = await db.insert(animals).values({ farmId: farm.id, tagNumber: "014", sex: "cow" }).returning();
    const ticket = await ticketFor(deps, farm, device, ["kudde"]);

    const response = await app.inject({
      method: "POST",
      url: "/sync/upload",
      headers: { authorization: `Bearer ${ticket}` },
      payload: { ops: [movementOp(animal.id, toCamp.id)] },
    });

    assert.equal(response.statusCode, 200);
    const [row] = await db.select().from(movements).where(eq(movements.farmId, farm.id));
    assert.equal(row.fromCampId, null);
  });
});

test("a treatment and a weight upload against the same animal", async () => {
  await withTestDb(async (db) => {
    const { app, deps } = await buildTestApp(db);
    const { farm, person, device } = await pairedPhone(db, "kudde");
    const [animal] = await db.insert(animals).values({ farmId: farm.id, tagNumber: "014", sex: "cow" }).returning();
    const ticket = await ticketFor(deps, farm, device, ["kudde"]);

    const response = await app.inject({
      method: "POST",
      url: "/sync/upload",
      headers: { authorization: `Bearer ${ticket}` },
      payload: {
        ops: [treatmentOp(animal.id, "Inenting", { dose: "5ml" }), weightOp(animal.id, 412.5)],
      },
    });

    assert.equal(response.statusCode, 200);

    const [treatmentRow] = await db.select().from(treatments).where(eq(treatments.farmId, farm.id));
    assert.equal(treatmentRow.createdBy, person.id);
    assert.equal(treatmentRow.moduleCode, "kudde");
    assert.equal(treatmentRow.animalId, animal.id);
    assert.equal(treatmentRow.treatmentType, "Inenting");
    assert.equal(treatmentRow.dose, "5ml");

    const [weightRow] = await db.select().from(weights).where(eq(weights.farmId, farm.id));
    assert.equal(weightRow.animalId, animal.id);
    assert.equal(weightRow.weightKg, 412.5);
  });
});

test("the same movement uploaded twice lands once", async () => {
  await withTestDb(async (db) => {
    const { app, deps } = await buildTestApp(db);
    const { farm, device } = await pairedPhone(db, "kudde");
    const [toCamp] = await db.insert(camps).values({ farmId: farm.id, name: "Kamp 2" }).returning();
    const [animal] = await db.insert(animals).values({ farmId: farm.id, tagNumber: "014", sex: "cow" }).returning();
    const ticket = await ticketFor(deps, farm, device, ["kudde"]);

    const op = movementOp(animal.id, toCamp.id);
    for (const _ of [1, 2]) {
      const response = await app.inject({
        method: "POST",
        url: "/sync/upload",
        headers: { authorization: `Bearer ${ticket}` },
        payload: { ops: [op] },
      });
      assert.equal(response.statusCode, 200);
    }

    assert.equal((await db.select().from(movements).where(eq(movements.farmId, farm.id))).length, 1);
  });
});

test("a device paired for stoor cannot upload a movement", async () => {
  await withTestDb(async (db) => {
    const { app, deps } = await buildTestApp(db);
    const { farm, device } = await pairedPhone(db, "stoor");
    const [toCamp] = await db.insert(camps).values({ farmId: farm.id, name: "Kamp 2" }).returning();
    const [animal] = await db.insert(animals).values({ farmId: farm.id, tagNumber: "014", sex: "cow" }).returning();
    const ticket = await ticketFor(deps, farm, device, ["stoor"]);

    const response = await app.inject({
      method: "POST",
      url: "/sync/upload",
      headers: { authorization: `Bearer ${ticket}` },
      payload: { ops: [movementOp(animal.id, toCamp.id)] },
    });

    assert.equal(response.statusCode, 403);
    assert.equal(response.json().error.code, "not_paired");
  });
});

test("a suspended Kudde licence holds the movement, treatment and weight instead of dropping them", async () => {
  await withTestDb(async (db) => {
    const { app, deps } = await buildTestApp(db);
    const { farm, device } = await pairedPhone(db, "kudde", "suspended");
    const [toCamp] = await db.insert(camps).values({ farmId: farm.id, name: "Kamp 2" }).returning();
    const [animal] = await db.insert(animals).values({ farmId: farm.id, tagNumber: "014", sex: "cow" }).returning();
    const ticket = await ticketFor(deps, farm, device, ["kudde"], { farmModules: [] });

    const response = await app.inject({
      method: "POST",
      url: "/sync/upload",
      headers: { authorization: `Bearer ${ticket}` },
      payload: {
        ops: [movementOp(animal.id, toCamp.id), treatmentOp(animal.id, "Inenting"), weightOp(animal.id, 400)],
      },
    });

    assert.equal(response.statusCode, 200);
    assert.equal(response.json().held, true);
    assert.equal((await db.select().from(movements).where(eq(movements.farmId, farm.id))).length, 0);
    assert.equal((await db.select().from(treatments).where(eq(treatments.farmId, farm.id))).length, 0);
    assert.equal((await db.select().from(weights).where(eq(weights.farmId, farm.id))).length, 0);
  });
});
