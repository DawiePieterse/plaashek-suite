import { meterReadings, waterPoints } from "@plaashek/schema";
import { and, asc, desc, eq } from "drizzle-orm";
import type { App, AppDeps } from "../app.js";
import { requireStaff } from "../auth/require-staff.js";
import { logAudit } from "../lib/audit.js";
import { requireDeviceTicket } from "../lib/device-ticket.js";
import { assertFarmOwns } from "../lib/farm.js";
import { createWaterPointRequestSchema, updateWaterPointRequestSchema } from "../schemas/water.js";

/**
 * Water (plan §11, docs/water-build-scope.md): the catalog of points, the
 * phone's offline-safe copy of it, and the latest reading per point.
 * `/export/water.csv` lives with the other exports in `export.ts`.
 */
export function registerWaterRoutes(app: App, deps: AppDeps) {
  app.get("/water-points", { preHandler: requireStaff(deps.env.staffSessionSecret, ["admin", "owner"]) }, async (request) => {
    const farmId = request.staff!.farmId;

    const points = await deps.db
      .select({ id: waterPoints.id, name: waterPoints.name, unit: waterPoints.unit, active: waterPoints.active })
      .from(waterPoints)
      .where(eq(waterPoints.farmId, farmId))
      .orderBy(asc(waterPoints.name));

    return { points };
  });

  app.post("/water-points", { preHandler: requireStaff(deps.env.staffSessionSecret, ["admin"]) }, async (request) => {
    const staff = request.staff!;
    const body = createWaterPointRequestSchema.parse(request.body);

    return deps.db.transaction(async (tx) => {
      const [point] = await tx.insert(waterPoints).values({ farmId: staff.farmId, name: body.name, unit: body.unit }).returning();
      await logAudit(tx, { actor: staff.farmMembershipId, action: "create_water_point", target: point.id, farmId: staff.farmId });
      return { point };
    });
  });

  /** Rename, fix the unit, or decommission a point. Nothing here touches readings already captured. */
  app.patch("/water-points/:pointId", { preHandler: requireStaff(deps.env.staffSessionSecret, ["admin"]) }, async (request) => {
    const staff = request.staff!;
    const { pointId } = request.params as { pointId: string };
    const body = updateWaterPointRequestSchema.parse(request.body);

    await assertFarmOwns(deps.db, waterPoints, waterPoints.id, waterPoints.farmId, pointId, staff.farmId);

    return deps.db.transaction(async (tx) => {
      const [point] = await tx
        .update(waterPoints)
        .set({
          ...(body.name === undefined ? {} : { name: body.name }),
          ...(body.unit === undefined ? {} : { unit: body.unit }),
          ...(body.active === undefined ? {} : { active: body.active }),
        })
        .where(eq(waterPoints.id, pointId))
        .returning();

      await logAudit(tx, { actor: staff.farmMembershipId, action: "edit_water_point", target: pointId, farmId: staff.farmId });

      return { point };
    });
  });

  /** The phone's cached picker (docs/water-build-scope.md) — active points only. */
  app.get("/water-catalog", async (request) => {
    const claims = await requireDeviceTicket(request.headers, deps);

    const points = await deps.db
      .select({ id: waterPoints.id, name: waterPoints.name, unit: waterPoints.unit })
      .from(waterPoints)
      .where(and(eq(waterPoints.farmId, claims.farmId), eq(waterPoints.active, true)))
      .orderBy(asc(waterPoints.name));

    return { points };
  });

  /**
   * The latest reading per point, and the delta against the one before it
   * (docs/water-build-scope.md) — the opposite shape from Stoor's running
   * total: a reading replaces the current state rather than accumulating.
   */
  app.get("/eienaar/water", { preHandler: requireStaff(deps.env.staffSessionSecret, ["admin", "owner"]) }, async (request) => {
    const farmId = request.staff!.farmId;

    const [points, readings] = await Promise.all([
      deps.db
        .select({ id: waterPoints.id, name: waterPoints.name, unit: waterPoints.unit, active: waterPoints.active })
        .from(waterPoints)
        .where(eq(waterPoints.farmId, farmId))
        .orderBy(asc(waterPoints.name)),
      // Newest first per point — the first two rows seen for a point are its latest and previous reading.
      deps.db
        .select({ waterPointId: meterReadings.waterPointId, reading: meterReadings.reading, at: meterReadings.createdAt })
        .from(meterReadings)
        .where(eq(meterReadings.farmId, farmId))
        .orderBy(desc(meterReadings.createdAt)),
    ]);

    const latestTwo = new Map<string, { reading: number; at: Date }[]>();
    for (const row of readings) {
      const forPoint = latestTwo.get(row.waterPointId) ?? [];
      if (forPoint.length < 2) forPoint.push({ reading: row.reading, at: row.at });
      latestTwo.set(row.waterPointId, forPoint);
    }

    return {
      points: points.map((point) => {
        const [latest, previous] = latestTwo.get(point.id) ?? [];
        return {
          pointId: point.id,
          name: point.name,
          unit: point.unit,
          active: point.active,
          latestReading: latest?.reading ?? null,
          latestAt: latest?.at.toISOString() ?? null,
          delta: latest && previous ? Math.round((latest.reading - previous.reading) * 100) / 100 : null,
        };
      }),
    };
  });
}
