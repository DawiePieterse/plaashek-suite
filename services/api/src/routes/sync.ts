import { deviceAssignments, deviceModules, heldWrites, notes } from "@plaashek/schema";
import { and, desc, eq, lte } from "drizzle-orm";
import type { App, AppDeps } from "../app.js";
import type { Db } from "../db.js";
import { requireDeviceTicket } from "../lib/device-ticket.js";
import { moduleStatus } from "../lib/entitlements.js";
import { forbidden } from "../lib/errors.js";
import { uploadRequestSchema, type UploadOp } from "../schemas/sync.js";

/** Veldnotas is the only module that captures anything yet (plan §11); a second entity brings a map. */
const MODULE_CODE = "veldnotas";

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

    // The floor is read live, not from the ticket: a revoke lands at the next
    // sync, and this is that sync (plan §3.5).
    const [paired] = await deps.db
      .select({ moduleCode: deviceModules.moduleCode })
      .from(deviceModules)
      .where(and(eq(deviceModules.deviceId, claims.deviceId), eq(deviceModules.moduleCode, MODULE_CODE)));
    if (!paired) throw forbidden("not_paired", `This device is not paired for module: ${MODULE_CODE}`);

    const status = await moduleStatus(deps.db, claims.farmId, MODULE_CODE);
    if (!status) throw forbidden("not_licensed", `Farm is not licensed for module: ${MODULE_CODE}`);

    // Never drop a capture over an invoice — hold it instead (plan §5).
    const held = status === "suspended" || status === "cancelled";

    // ponytail: two queries per op, fine for a phone's handful of notes.
    // Batch the assignment lookup and the insert if a device ever syncs hundreds.
    return deps.db.transaction(async (tx) => {
      const accepted: string[] = [];

      for (const op of ops) {
        const clientTime = new Date(op.client_time);

        if (held) {
          await tx.insert(heldWrites).values({
            farmId: claims.farmId,
            moduleCode: MODULE_CODE,
            deviceId: claims.deviceId,
            entity: op.entity,
            entityId: op.entity_id,
            payload: op.payload,
            clientTime,
          }).onConflictDoNothing();
          accepted.push(op.entity_id);
          continue;
        }

        await applyNote(tx, claims.farmId, claims.deviceId, op, clientTime);
        accepted.push(op.entity_id);
      }

      return { accepted, held, serverTime: new Date().toISOString() };
    });
  });
}

/**
 * Notes are append-only events (plan §7), so the same id arriving twice is a
 * retry, not a second note — `onConflictDoNothing` makes that idempotent in one
 * statement, with no read-then-write race. `resolveWrite`'s last-write-wins
 * branch is for scalar tables and lands with the first editable module.
 */
async function applyNote(tx: Pick<Db, "select" | "insert">, farmId: string, deviceId: string, op: UploadOp, clientTime: Date) {
  const createdBy = await personAtSaveTime(tx, deviceId, clientTime);
  if (!createdBy) throw forbidden("device_unassigned", "This device has no assigned person");

  await tx
    .insert(notes)
    .values({
      id: op.entity_id,
      farmId,
      moduleCode: MODULE_CODE,
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
