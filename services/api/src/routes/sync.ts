import {
  attendancePunches,
  deviceAssignments,
  deviceModules,
  fuelLogs,
  harvestEvents,
  heldWrites,
  meterReadings,
  notes,
  people,
  sprayApplications,
  stockMoves,
  workOrders,
} from "@plaashek/schema";
import { and, desc, eq, isNull, lte } from "drizzle-orm";
import type { App, AppDeps } from "../app.js";
import type { Db } from "../db.js";
import { derivedId } from "../lib/derived-id.js";
import { requireDeviceTicket } from "../lib/device-ticket.js";
import { moduleStatus } from "../lib/entitlements.js";
import { forbidden } from "../lib/errors.js";
import { normaliseWorkerNumber } from "../lib/worker-number.js";
import {
  uploadRequestSchema,
  type AttendancePunchOp,
  type FuelLogOp,
  type HarvestEventOp,
  type MeterReadingOp,
  type NoteOp,
  type SprayApplicationOp,
  type StockMoveOp,
  type UploadOp,
  type WorkOrderOp,
} from "../schemas/sync.js";

/** Which module owns each entity a phone can upload (plan §11: veldnotas, boord, span, stoor, water, werkswinkel, bespuiting). */
const MODULE_CODE: Record<UploadOp["entity"], string> = {
  notes: "veldnotas",
  harvest_events: "boord",
  attendance_punches: "span",
  stock_moves: "stoor",
  meter_readings: "water",
  work_orders: "werkswinkel",
  fuel_logs: "werkswinkel",
  spray_applications: "bespuiting",
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

/** Every `apply*` below needs this same lookup-or-refuse — the device must have someone assigned at save time to attribute the capture to. */
async function requireCreatedBy(db: Pick<Db, "select">, deviceId: string, clientTime: Date): Promise<string> {
  const createdBy = await personAtSaveTime(db, deviceId, clientTime);
  if (!createdBy) throw forbidden("device_unassigned", "This device has no assigned person");
  return createdBy;
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

        switch (op.entity) {
          case "notes":
            await applyNote(tx, claims.farmId, claims.deviceId, op, clientTime);
            break;
          case "harvest_events":
            await applyHarvestEvent(tx, claims.farmId, claims.deviceId, op, clientTime);
            break;
          case "attendance_punches":
            await applyAttendancePunch(tx, claims.farmId, claims.deviceId, op, clientTime);
            break;
          case "stock_moves":
            await applyStockMove(tx, claims.farmId, claims.deviceId, op, clientTime);
            break;
          case "meter_readings":
            await applyMeterReading(tx, claims.farmId, claims.deviceId, op, clientTime);
            break;
          case "work_orders":
            await applyWorkOrder(tx, claims.farmId, claims.deviceId, op, clientTime);
            break;
          case "fuel_logs":
            await applyFuelLog(tx, claims.farmId, claims.deviceId, op, clientTime);
            break;
          case "spray_applications":
            await applySprayApplication(tx, claims.farmId, claims.deviceId, op, clientTime);
            break;
          default: {
            // Exhaustiveness check: a new entity added to UploadOp without a case here is now a compile error, not a silent fall-through.
            const unhandled: never = op;
            throw new Error(`Unhandled sync entity: ${(unhandled as UploadOp).entity}`);
          }
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
  const createdBy = await requireCreatedBy(tx, deviceId, clientTime);

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
 * Whose worker number was scanned (ADR 0011). The phone resolves this from
 * its cached register, but a worker added after that cache was filled
 * resolves here instead — which is why the phone is allowed to save the
 * crate with a number it does not recognise (plan §8: never block a capture
 * over configuration).
 *
 * The phone never sends a person id, only the number it read — so a device
 * cannot assert who picked a crate. This function is the only place a number
 * becomes an attribution, and it will not credit a worker who has left.
 *
 * Takes an already-normalised number — the caller normalises once, on the way in.
 */
async function resolvePicker(tx: Pick<Db, "select">, farmId: string, workerNumber: string | null): Promise<string | null> {
  if (!workerNumber) return null;

  const [picker] = await tx
    .select({ id: people.id })
    .from(people)
    .where(and(eq(people.farmId, farmId), eq(people.workerNumber, workerNumber), eq(people.active, true)));

  return picker?.id ?? null;
}

/** Same append-only shape as a note — no edit path (ADR 0006's precedent, kept by ADR 0009). */
async function applyHarvestEvent(tx: Pick<Db, "select" | "insert">, farmId: string, deviceId: string, op: HarvestEventOp, clientTime: Date) {
  const createdBy = await requireCreatedBy(tx, deviceId, clientTime);

  const scannedNumber = op.payload.picker_card_code ? normaliseWorkerNumber(op.payload.picker_card_code) : null;
  const pickerId = await resolvePicker(tx, farmId, scannedNumber);

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
      pickerCardCode: scannedNumber,
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
  const createdBy = await requireCreatedBy(tx, deviceId, clientTime);

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

/**
 * A move on the store's ledger (docs/stoor-build-scope.md) — item, direction,
 * quantity, stamped with whoever the device was assigned to. Append-only like
 * every other capture: a miscounted move is followed by a correcting one.
 */
async function applyStockMove(tx: Pick<Db, "select" | "insert">, farmId: string, deviceId: string, op: StockMoveOp, clientTime: Date) {
  const createdBy = await requireCreatedBy(tx, deviceId, clientTime);

  await tx
    .insert(stockMoves)
    .values({
      id: op.entity_id,
      farmId,
      moduleCode: MODULE_CODE.stock_moves,
      seasonId: op.season_id,
      createdBy,
      deviceId,
      itemId: op.payload.item_id,
      direction: op.payload.direction,
      quantity: op.payload.quantity,
      blockId: op.payload.block_id ?? null,
      note: op.payload.note ?? null,
      createdAt: clientTime,
      updatedAt: clientTime,
    })
    .onConflictDoNothing();
}

/**
 * One number against one point (docs/water-build-scope.md). Append-only,
 * always season-null (plan §6, §8).
 */
async function applyMeterReading(tx: Pick<Db, "select" | "insert">, farmId: string, deviceId: string, op: MeterReadingOp, clientTime: Date) {
  const createdBy = await requireCreatedBy(tx, deviceId, clientTime);

  await tx
    .insert(meterReadings)
    .values({
      id: op.entity_id,
      farmId,
      moduleCode: MODULE_CODE.meter_readings,
      seasonId: op.season_id,
      createdBy,
      deviceId,
      waterPointId: op.payload.water_point_id,
      reading: op.payload.reading,
      note: op.payload.note ?? null,
      createdAt: clientTime,
      updatedAt: clientTime,
    })
    .onConflictDoNothing();
}

/**
 * One half of a job's lifecycle (docs/werkswinkel-build-scope.md) — `opened`
 * or `closed`, paired at read time. Append-only, always season-null.
 */
async function applyWorkOrder(tx: Pick<Db, "select" | "insert">, farmId: string, deviceId: string, op: WorkOrderOp, clientTime: Date) {
  const createdBy = await requireCreatedBy(tx, deviceId, clientTime);

  await tx
    .insert(workOrders)
    .values({
      id: op.entity_id,
      farmId,
      moduleCode: MODULE_CODE.work_orders,
      seasonId: op.season_id,
      createdBy,
      deviceId,
      assetId: op.payload.asset_id,
      event: op.payload.event,
      description: op.payload.description ?? null,
      createdAt: clientTime,
      updatedAt: clientTime,
    })
    .onConflictDoNothing();
}

/** One fill-up (docs/werkswinkel-build-scope.md). Append-only, always season-null. */
async function applyFuelLog(tx: Pick<Db, "select" | "insert">, farmId: string, deviceId: string, op: FuelLogOp, clientTime: Date) {
  const createdBy = await requireCreatedBy(tx, deviceId, clientTime);

  await tx
    .insert(fuelLogs)
    .values({
      id: op.entity_id,
      farmId,
      moduleCode: MODULE_CODE.fuel_logs,
      seasonId: op.season_id,
      createdBy,
      deviceId,
      assetId: op.payload.asset_id,
      litres: op.payload.litres,
      meterReading: op.payload.meter_reading ?? null,
      note: op.payload.note ?? null,
      createdAt: clientTime,
      updatedAt: clientTime,
    })
    .onConflictDoNothing();
}

/**
 * A chemical or fertigation application (docs/bespuiting-build-scope.md).
 * This is the one place a module's sync handler writes into two other
 * modules' tables on purpose: saving an application also books a Stoor
 * stock-out (so `/eienaar/stock` and `/export/stock.csv` need no separate
 * entry for what was used) and, if a Kraan was involved, a Water reading —
 * both under ids derived from this op's own entity_id, so a retried sync
 * cannot double-book either ledger. Stoor's and Water's own code stays
 * unaware Bespuiting exists.
 */
async function applySprayApplication(
  tx: Pick<Db, "select" | "insert">,
  farmId: string,
  deviceId: string,
  op: SprayApplicationOp,
  clientTime: Date,
) {
  const createdBy = await requireCreatedBy(tx, deviceId, clientTime);

  await tx
    .insert(sprayApplications)
    .values({
      id: op.entity_id,
      farmId,
      moduleCode: MODULE_CODE.spray_applications,
      seasonId: op.season_id,
      createdBy,
      deviceId,
      blockId: op.payload.block_id,
      itemId: op.payload.item_id,
      quantity: op.payload.quantity,
      concentration: op.payload.concentration ?? null,
      reason: op.payload.reason ?? null,
      method: op.payload.method ?? null,
      waterPointId: op.payload.water_point_id ?? null,
      meterReading: op.payload.meter_reading ?? null,
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

  await tx
    .insert(stockMoves)
    .values({
      id: derivedId(`spray_applications:${op.entity_id}:stock_moves`),
      farmId,
      moduleCode: "stoor",
      seasonId: op.season_id,
      createdBy,
      deviceId,
      itemId: op.payload.item_id,
      direction: "out",
      quantity: op.payload.quantity,
      blockId: op.payload.block_id,
      note: "via bespuiting application",
      createdAt: clientTime,
      updatedAt: clientTime,
    })
    .onConflictDoNothing();

  if (op.payload.water_point_id && op.payload.meter_reading != null) {
    await tx
      .insert(meterReadings)
      .values({
        id: derivedId(`spray_applications:${op.entity_id}:meter_readings`),
        farmId,
        moduleCode: "water",
        // Water is season-less (plan §6, §8) even when the application that triggered it is not.
        seasonId: null,
        createdBy,
        deviceId,
        waterPointId: op.payload.water_point_id,
        reading: op.payload.meter_reading,
        note: "via bespuiting application",
        createdAt: clientTime,
        updatedAt: clientTime,
      })
      .onConflictDoNothing();
  }
}
