import assert from "node:assert/strict";
import test from "node:test";
import { deviceAssignments, deviceModules, devices, entitlements, heldWrites, notes, people } from "@plaashek/schema";
import { mintTicket } from "@plaashek/tickets";
import { eq } from "drizzle-orm";
import type { Db } from "../db.js";
import { buildTestApp } from "../test/app.js";
import { withTestDb } from "../test/db.js";
import { seedFarm } from "../test/fixtures.js";

type EntitlementStatus = "active" | "grace" | "suspended" | "cancelled";

/** A paired veldnotas phone, assigned to one person, on a farm with the given licence status. */
async function pairedPhone(db: Db, status: EntitlementStatus) {
  const { farm, person, membership } = await seedFarm(db);
  await db.insert(entitlements).values({ farmId: farm.id, moduleCode: "veldnotas", status });

  const [device] = await db.insert(devices).values({ farmId: farm.id, label: "Toetsfoon" }).returning();
  await db.insert(deviceModules).values({ deviceId: device.id, moduleCode: "veldnotas" });
  await db
    .insert(deviceAssignments)
    .values({ deviceId: device.id, personId: person.id, assignedBy: membership.id, assignedAt: new Date("2026-01-01T00:00:00Z") });

  return { farm, person, membership, device };
}

const op = (body: string, clientTime: string) => ({
  entity: "notes" as const,
  entity_id: crypto.randomUUID(),
  client_time: clientTime,
  season_id: null,
  payload: { body },
});

test("an offline note uploads, stamped with the farm, device and assigned person", async () => {
  await withTestDb(async (db) => {
    const { app, deps } = await buildTestApp(db);
    const { farm, person, device } = await pairedPhone(db, "active");
    const ticket = await mintTicket({
      farmId: farm.id,
      deviceId: device.id,
      farmModules: ["veldnotas"],
      deviceModules: ["veldnotas"],
      language: "af",
      seasonId: null,
      signingKey: deps.keys.privateKey,
    });

    const capturedAt = "2026-06-01T07:30:00.000Z";
    const response = await app.inject({
      method: "POST",
      url: "/sync/upload",
      headers: { authorization: `Bearer ${ticket}` },
      payload: { ops: [op("Luise op blok A", capturedAt)] },
    });

    assert.equal(response.statusCode, 200);
    assert.equal(response.json().held, false);

    const [note] = await db.select().from(notes).where(eq(notes.farmId, farm.id));
    assert.equal(note.body, "Luise op blok A");
    assert.equal(note.createdBy, person.id);
    assert.equal(note.deviceId, device.id);
    assert.equal(note.moduleCode, "veldnotas");
    // The phone's save time, not the moment it finally found signal.
    assert.equal(note.createdAt.toISOString(), capturedAt);
  });
});

test("attribution follows the assignment at save time, not the one at upload time", async () => {
  await withTestDb(async (db) => {
    const { app, deps } = await buildTestApp(db);
    const { farm, person, membership, device } = await pairedPhone(db, "active");

    // The phone changes hands after the note was taken but before it syncs.
    const [second] = await db.insert(people).values({ farmId: farm.id, name: "Tweede Persoon" }).returning();
    await db
      .insert(deviceAssignments)
      .values({ deviceId: device.id, personId: second.id, assignedBy: membership.id, assignedAt: new Date("2026-06-02T00:00:00Z") });

    const ticket = await mintTicket({
      farmId: farm.id,
      deviceId: device.id,
      farmModules: ["veldnotas"],
      deviceModules: ["veldnotas"],
      language: "af",
      seasonId: null,
      signingKey: deps.keys.privateKey,
    });

    await app.inject({
      method: "POST",
      url: "/sync/upload",
      headers: { authorization: `Bearer ${ticket}` },
      payload: { ops: [op("Voor die oorhandiging", "2026-06-01T07:30:00.000Z")] },
    });

    const [note] = await db.select().from(notes).where(eq(notes.farmId, farm.id));
    assert.equal(note.createdBy, person.id);
  });
});

test("a revoked device is refused, and the same note twice is not two notes", async () => {
  await withTestDb(async (db) => {
    const { app, deps } = await buildTestApp(db);
    const { farm, device } = await pairedPhone(db, "active");
    const ticket = await mintTicket({
      farmId: farm.id,
      deviceId: device.id,
      farmModules: ["veldnotas"],
      deviceModules: ["veldnotas"],
      language: "af",
      seasonId: null,
      signingKey: deps.keys.privateKey,
    });

    const retried = op("Een keer", "2026-06-01T07:30:00.000Z");
    const send = () =>
      app.inject({ method: "POST", url: "/sync/upload", headers: { authorization: `Bearer ${ticket}` }, payload: { ops: [retried] } });

    assert.equal((await send()).statusCode, 200);
    assert.equal((await send()).statusCode, 200);
    assert.equal((await db.select().from(notes).where(eq(notes.farmId, farm.id))).length, 1);

    // Revoke drops the device's module rows — the next sync is where it bites.
    await db.delete(deviceModules).where(eq(deviceModules.deviceId, device.id));

    const afterRevoke = await send();
    assert.equal(afterRevoke.statusCode, 403);
    assert.equal(afterRevoke.json().error.code, "not_paired");
  });
});

test("a suspended licence holds the capture instead of dropping it", async () => {
  await withTestDb(async (db) => {
    const { app, deps } = await buildTestApp(db);
    const { farm, device } = await pairedPhone(db, "suspended");
    const ticket = await mintTicket({
      farmId: farm.id,
      deviceId: device.id,
      farmModules: [],
      deviceModules: ["veldnotas"],
      language: "af",
      seasonId: null,
      signingKey: deps.keys.privateKey,
    });

    const response = await app.inject({
      method: "POST",
      url: "/sync/upload",
      headers: { authorization: `Bearer ${ticket}` },
      payload: { ops: [op("Tydens die skorsing", "2026-06-01T07:30:00.000Z")] },
    });

    assert.equal(response.statusCode, 200);
    assert.equal(response.json().held, true);
    assert.equal((await db.select().from(notes).where(eq(notes.farmId, farm.id))).length, 0);
    assert.equal((await db.select().from(heldWrites).where(eq(heldWrites.farmId, farm.id))).length, 1);
  });
});
