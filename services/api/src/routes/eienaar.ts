import { attendancePunches, blocks, harvestEvents, people, seasons } from "@plaashek/schema";
import { and, asc, count, eq, sum } from "drizzle-orm";
import type { App, AppDeps } from "../app.js";
import { requireStaff } from "../auth/require-staff.js";
import { rollUpAttendance } from "../lib/attendance.js";

/**
 * Eienaar's first screen (docs/boord-reuse-audit.md): crates + kg captured,
 * by block, for the farm's active season. Read-only rollup off Plaashek's own
 * `harvest_events` — no cross-service DB read, no wage column.
 */
export function registerEienaarRoutes(app: App, deps: AppDeps) {
  app.get("/eienaar/harvest", { preHandler: requireStaff(deps.env.staffSessionSecret, ["admin", "owner"]) }, async (request) => {
    const farmId = request.staff!.farmId;

    const [activeSeason] = await deps.db
      .select({ id: seasons.id, name: seasons.name })
      .from(seasons)
      .where(and(eq(seasons.farmId, farmId), eq(seasons.isActive, true)));

    // No active season: nothing to roll up yet rather than mixing seasons together.
    if (!activeSeason) return { season: null, blocks: [] };

    const rows = await deps.db
      .select({ blockId: blocks.id, blockName: blocks.name, crates: count(harvestEvents.id), kg: sum(harvestEvents.weightKg) })
      .from(harvestEvents)
      .innerJoin(blocks, eq(blocks.id, harvestEvents.blockId))
      .where(and(eq(harvestEvents.farmId, farmId), eq(harvestEvents.seasonId, activeSeason.id)))
      .groupBy(blocks.id, blocks.name)
      .orderBy(blocks.name);

    return {
      season: activeSeason,
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

    const [activeSeason] = await deps.db
      .select({ id: seasons.id, name: seasons.name })
      .from(seasons)
      .where(and(eq(seasons.farmId, farmId), eq(seasons.isActive, true)));

    if (!activeSeason) return { season: null, people: [] };

    const punches = await deps.db
      .select({
        personId: attendancePunches.createdBy,
        personName: people.name,
        direction: attendancePunches.direction,
        at: attendancePunches.createdAt,
      })
      .from(attendancePunches)
      .innerJoin(people, eq(people.id, attendancePunches.createdBy))
      .where(and(eq(attendancePunches.farmId, farmId), eq(attendancePunches.seasonId, activeSeason.id)))
      .orderBy(asc(attendancePunches.createdAt));

    return { season: activeSeason, people: rollUpAttendance(punches) };
  });
}
