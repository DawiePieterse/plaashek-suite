import { attendancePunches, deviceAssignments, deviceModules, harvestEvents, heldWrites, notes, people, workerCards } from "@plaashek/schema";
import { and, desc, eq, isNull, lte } from "drizzle-orm";
import type { App, AppDeps } from "../app.js";
import type { Db } from "../db.js";
import { requireDeviceTicket } from "../lib/device-ticket.js";
import { moduleStatus } from "../lib/entitlements.js";
import { forbidden } from "../lib/errors.js";
import { normaliseCardCode } from "../lib/worker-card.js";
import { uploadRequestSchema, type AttendancePunchOp, type HarvestEventOp, type NoteOp } from "../schemas/sync.js";

/** Which module owns each entity a phone can upload (plan §11: veldnotas, boord, then span). */
const MODULE_CODE: Record<NoteOp["entity"] | HarvestEventOp["entity"] | AttendancePunchOp["entity"], string> = {
  notes: "veldnotas",
  harvest_events: "boord",
  attendance_punches: "span",
};

/**
 * Who the phone was assigned to *when the note was taken*, not when it finally
 * reached signal — device_assignments is append-only, so a reassignment a week
 * later must not steal the attribution for last week's captures (plan §3.2).
 */
async function personAtSaveTime(db: Pick<Db, "select">, deviceId: string, clientTime: Date) {
  const [assignment] = await db
    .select({ personId: deviceAssignments.personId })
    .from(deviceAssignments)
    .where(and(eq(deviceAssignments.deviceId, deviceId), lte(deviceAssignments.assignedAt, clientTime)))
    .orderBy(desc(deviceAssignments.assignedAt))
    .limit(1);

  if (assignment) return assignment.personId;

  // Captured before the first assignment (a phone whose clock is behind) — fall
  // back to the earliest one rather than dropping the capture.
  const [earliest] = await db
    .select({ personId: deviceAssignments.personId })
    .from(deviceAssignments)
    .where(eq(deviceAssignments.deviceId, deviceId))
    .orderBy(deviceAssignments.assignedAt)
    .limit(1);

  return earliest?.personId ?? null;
}

export function registerSyncRoutes(app: App, deps: AppDeps) {
  app.post("/sync/upload", async (request) => {
    const claims = await requireDeviceTicket(request.headers, deps);
    const { ops } = uploadRequestSchema.parse(request.body);

    // A batch only ever touches the module(s) this phone actually has open, but
    // check each once and cache — a mixed batch must not pay for the same
    // module twice.
    const heldModules = new Set<string>();
    for (const moduleCode of new Set(ops.map((op) => MODULE_CODE[op.entity]))) {
      // The floor is read live, not from the ticket: a revoke lands at the next
      // sync, and this is that sync (plan §3.5).
      const [paired] = await deps.db
        .select({ moduleCode: deviceModules.moduleCode })
        .from(deviceModules)
        .where(and(eq(deviceModules.deviceId, claims.deviceId), eq(deviceModules.moduleCode, moduleCode)));
      if (!paired) throw forbidden("not_paired", `This device is not paired for module: ${moduleCode}`);

      const status = await moduleStatus(deps.db, claims.farmId, moduleCode);
      if (!status) throw forbidden("not_licensed", `Farm is not licensed for module: ${moduleCode}`);

      // Never drop a capture over an invoice — hold it instead (plan §5).
      if (status === "suspended" || status === "cancelled") heldModules.add(moduleCode);
    }

    // ponytail: two queries per op, fine for a phone's handful of captures.
    // Batch the assignment lookup and the insert if a device ever syncs hundreds.
    return deps.db.transaction(async (tx) => {
      const accepted: string[] = [];
      let held = false;

      for (const op of ops) {
        const moduleCode = MODULE_CODE[op.entity];
        const clientTime = new Date(op.client_time);

        if (heldModules.has(moduleCode)) {
          held = true;
          await tx.insert(heldWrites).values({
            farmId: claims.farmId,
            moduleCode,
            deviceId: claims.deviceId,
            entity: op.entity,
            entityId: op.entity_id,
            payload: op.payload,
            clientTime,
          }).onConflictDoNothing();
          accepted.push(op.entity_id);
          continue;
        }

        if (op.entity === "notes") {
          await applyNote(tx, claims.farmId, claims.deviceId, op, clientTime);
        } else if (op.entity === "harvest_events") {
          await applyHarvestEvent(tx, claims.farmId, claims.deviceId, op, clientTime);
        } else {
          await applyAttendancePunch(tx, claims.farmId, claims.deviceId, op, clientTime);
        }
        accepted.push(op.entity_id);
      }

      return { accepted, held, serverTime: new Date().toISOString() };
    });
  });
}

/**
 * Notes are append-only events (plan §7), so the same id arriving twice is a
 * retry, not a second note — `onConflictDoNothing` makes that idempotent in one
 * statement, with no read-then-write race.
 */
async function applyNote(tx: Pick<Db, "select" | "insert">, farmId: string, deviceId: string, op: NoteOp, clientTime: Date) {
  const createdBy = await personAtSaveTime(tx, deviceId, clientTime);
  if (!createdBy) throw forbidden("device_unassigned", "This device has no assigned person");

  await tx
    .insert(notes)
    .values({
      id: op.entity_id,
      farmId,
      moduleCode: MODULE_CODE.notes,
      seasonId: op.season_id,
      createdBy,
      deviceId,
      body: op.payload.body,
      blockId: op.payload.block_id ?? null,
      latitude: op.payload.latitude ?? null,
      longitude: op.payload.longitude ?? null,
      locationAccuracyM: op.payload.location_accuracy_m ?? null,
      weatherTemp: op.payload.weather_temp ?? null,
      weatherHumidity: op.payload.weather_humidity ?? null,
      weatherCondition: op.payload.weather_condition ?? null,
      createdAt: clientTime,
      updatedAt: clientTime,
    })
    .onConflictDoNothing();
}

/**
 * Who the scanned card belongs to. The phone resolves this from its cached
 * card list, but a card issued after that cache was filled resolves here
 * instead — which is why the phone is allowed to save the crate with a code
 * it does not recognise (plan §8: never block a capture over configuration).
 *
 * The phone never sends a person id, only the code it scanned — so a device
 * cannot assert who picked a crate, it can only report what it read off a
 * card. This function is the only place a code becomes an attribution.
 */
async function resolvePicker(
  tx: Pick<Db, "select">,
  farmId: string,
  code: string | null | undefined,
): Promise<string | null> {
  if (!code) return null;

  const [card] = await tx
    .select({ personId: workerCards.personId })
    .from(workerCards)
    .innerJoin(people, eq(people.id, workerCards.personId))
    .where(and(eq(workerCards.farmId, farmId), eq(workerCards.code, normaliseCardCode(code)), isNull(workerCards.revokedAt)));

  return card?.personId ?? null;
}

/** Same append-only shape as a note — no edit path (ADR 0006's precedent, kept by ADR 0009). */
async function applyHarvestEvent(tx: Pick<Db, "select" | "insert">, farmId: string, deviceId: string, op: HarvestEventOp, clientTime: Date) {
  const createdBy = await personAtSaveTime(tx, deviceId, clientTime);
  if (!createdBy) throw forbidden("device_unassigned", "This device has no assigned person");

  const cardCode = op.payload.picker_card_code ? normaliseCardCode(op.payload.picker_card_code) : null;
  const pickerId = await resolvePicker(tx, farmId, cardCode);

  await tx
    .insert(harvestEvents)
    .values({
      id: op.entity_id,
      farmId,
      moduleCode: MODULE_CODE.harvest_events,
      seasonId: op.season_id,
      createdBy,
      deviceId,
      blockId: op.payload.block_id,
      weightKg: op.payload.weight_kg,
      deductionKg: op.payload.deduction_kg ?? null,
      pickerId,
      pickerCardCode: cardCode,
      weatherTemp: op.payload.weather_temp ?? null,
      weatherHumidity: op.payload.weather_humidity ?? null,
      weatherCondition: op.payload.weather_condition ?? null,
      createdAt: clientTime,
      updatedAt: clientTime,
    })
    .onConflictDoNothing();
}

/**
 * A punch is the thinnest capture in the suite: a direction, and whichever
 * person the device was assigned to at the time (ADR 0008 — the phone clocks
 * itself). Append-only like the other two; the server never rejects a second
 * `in` (docs/span-build-scope.md — the office reads the sequence, the phone
 * does not argue with a worker at 05:50).
 */
async function applyAttendancePunch(
  tx: Pick<Db, "select" | "insert">,
  farmId: string,
  deviceId: string,
  op: AttendancePunchOp,
  clientTime: Date,
) {
  const createdBy = await personAtSaveTime(tx, deviceId, clientTime);
  if (!createdBy) throw forbidden("device_unassigned", "This device has no assigned person");

  await tx
    .insert(attendancePunches)
    .values({
      id: op.entity_id,
      farmId,
      moduleCode: MODULE_CODE.attendance_punches,
      seasonId: op.season_id,
      createdBy,
      deviceId,
      direction: op.payload.direction,
      latitude: op.payload.latitude ?? null,
      longitude: op.payload.longitude ?? null,
      locationAccuracyM: op.payload.location_accuracy_m ?? null,
      createdAt: clientTime,
      updatedAt: clientTime,
    })
    .onConflictDoNothing();
}
