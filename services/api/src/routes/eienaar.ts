import { assets, attendancePunches, blocks, fuelLogs, harvestEvents, meterReadings, people, workOrders } from "@plaashek/schema";
import { and, asc, count, eq, sum } from "drizzle-orm";
import type { App, AppDeps } from "../app.js";
import { requireStaff } from "../auth/require-staff.js";
import { rollUpAttendance } from "../lib/attendance.js";
import { activeSeason } from "../lib/farm.js";
import { latestReadingPerAsset } from "../lib/water.js";
import { fuelByAsset, openWorkOrders } from "../lib/werkswinkel.js";

/**
 * Eienaar's first screen (docs/boord-reuse-audit.md): crates + kg captured,
 * by block, for the farm's active season. Read-only rollup off Plaashek's own
 * `harvest_events` — no cross-service DB read, no wage column.
 */
export function registerEienaarRoutes(app: App, deps: AppDeps) {
  app.get("/eienaar/harvest", { preHandler: requireStaff(deps.env.staffSessionSecret, ["admin", "owner"]) }, async (request) => {
    const farmId = request.staff!.farmId;

    // No active season: nothing to roll up yet rather than mixing seasons together.
    const season = await activeSeason(deps.db, farmId);
    if (!season) return { season: null, blocks: [] };

    const rows = await deps.db
      .select({ blockId: blocks.id, blockName: blocks.name, crates: count(harvestEvents.id), kg: sum(harvestEvents.weightKg) })
      .from(harvestEvents)
      .innerJoin(blocks, eq(blocks.id, harvestEvents.blockId))
      .where(and(eq(harvestEvents.farmId, farmId), eq(harvestEvents.seasonId, season.id)))
      .groupBy(blocks.id, blocks.name)
      .orderBy(blocks.name);

    return {
      season: { id: season.id, name: season.name },
      blocks: rows.map((row) => ({ blockId: row.blockId, blockName: row.blockName, crates: row.crates, kg: Number(row.kg ?? 0) })),
    };
  });

  /**
   * Span in owner form (docs/span-build-scope.md): days and hours per person
   * for the active season, paired at read time. Same active-season rule as
   * the harvest rollup — no season, no mixing.
   */
  app.get("/eienaar/attendance", { preHandler: requireStaff(deps.env.staffSessionSecret, ["admin", "owner"]) }, async (request) => {
    const farmId = request.staff!.farmId;

    const season = await activeSeason(deps.db, farmId);
    if (!season) return { season: null, people: [] };

    const punches = await deps.db
      .select({
        personId: attendancePunches.createdBy,
        personName: people.name,
        direction: attendancePunches.direction,
        at: attendancePunches.createdAt,
      })
      .from(attendancePunches)
      .innerJoin(people, eq(people.id, attendancePunches.createdBy))
      .where(and(eq(attendancePunches.farmId, farmId), eq(attendancePunches.seasonId, season.id)))
      .orderBy(asc(attendancePunches.createdAt));

    return { season: { id: season.id, name: season.name }, people: rollUpAttendance(punches) };
  });

  /**
   * Water in owner form (docs/water-build-scope.md): the latest reading per
   * asset. Not season-gated — Water is one of the season-less modules
   * (plan §6), so there is nothing to filter on.
   */
  app.get("/eienaar/water", { preHandler: requireStaff(deps.env.staffSessionSecret, ["admin", "owner"]) }, async (request) => {
    const farmId = request.staff!.farmId;

    const rows = await deps.db
      .select({
        assetId: meterReadings.assetId,
        assetName: assets.name,
        personName: people.name,
        reading: meterReadings.reading,
        note: meterReadings.note,
        at: meterReadings.createdAt,
      })
      .from(meterReadings)
      .innerJoin(assets, eq(assets.id, meterReadings.assetId))
      .innerJoin(people, eq(people.id, meterReadings.createdBy))
      .where(eq(meterReadings.farmId, farmId));

    return { readings: latestReadingPerAsset(rows) };
  });

  /**
   * Werkswinkel's open work orders (docs/werkswinkel-build-scope.md): for
   * each asset, whether its most recent event is still `open`. Not
   * season-gated — Werkswinkel is season-less (plan §6).
   */
  app.get("/eienaar/work-orders", { preHandler: requireStaff(deps.env.staffSessionSecret, ["admin", "owner"]) }, async (request) => {
    const farmId = request.staff!.farmId;

    const rows = await deps.db
      .select({
        assetId: workOrders.assetId,
        assetName: assets.name,
        personName: people.name,
        description: workOrders.description,
        status: workOrders.status,
        at: workOrders.createdAt,
      })
      .from(workOrders)
      .innerJoin(assets, eq(assets.id, workOrders.assetId))
      .innerJoin(people, eq(people.id, workOrders.createdBy))
      .where(eq(workOrders.farmId, farmId));

    return { open: openWorkOrders(rows) };
  });

  /** Werkswinkel's fuel register (docs/werkswinkel-build-scope.md): litres per asset, all time. */
  app.get("/eienaar/fuel", { preHandler: requireStaff(deps.env.staffSessionSecret, ["admin", "owner"]) }, async (request) => {
    const farmId = request.staff!.farmId;

    const rows = await deps.db
      .select({ assetId: fuelLogs.assetId, assetName: assets.name, litresUsed: fuelLogs.litresUsed })
      .from(fuelLogs)
      .innerJoin(assets, eq(assets.id, fuelLogs.assetId))
      .where(eq(fuelLogs.farmId, farmId));

    return { assets: fuelByAsset(rows) };
  });
}
