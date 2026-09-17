import { attendancePunches, blocks, harvestEvents, notes, people, seasons } from "@plaashek/schema";
import { asc, eq } from "drizzle-orm";
import type { App, AppDeps } from "../app.js";
import { requireStaff } from "../auth/require-staff.js";
import { sendCsv, toCsv } from "../lib/csv.js";

/**
 * Excel export for the office tools (plan §10 offboarding, §12 Phase 4) — one
 * CSV per module with captured data. CSV rather than a real .xlsx: Excel opens
 * it natively, no dependency to reach for a two-column-of-numbers spreadsheet.
 */
export function registerExportRoutes(app: App, deps: AppDeps) {
  app.get("/export/notes.csv", { preHandler: requireStaff(deps.env.staffSessionSecret, ["admin", "owner"]) }, async (request, reply) => {
    const farmId = request.staff!.farmId;

    const rows = await deps.db
      .select({
        id: notes.id,
        createdAt: notes.createdAt,
        person: people.name,
        block: blocks.name,
        season: seasons.name,
        body: notes.body,
        latitude: notes.latitude,
        longitude: notes.longitude,
        weatherTemp: notes.weatherTemp,
        weatherHumidity: notes.weatherHumidity,
        weatherCondition: notes.weatherCondition,
      })
      .from(notes)
      .leftJoin(people, eq(people.id, notes.createdBy))
      .leftJoin(blocks, eq(blocks.id, notes.blockId))
      .leftJoin(seasons, eq(seasons.id, notes.seasonId))
      .where(eq(notes.farmId, farmId))
      .orderBy(asc(notes.createdAt));

    const csv = toCsv(
      ["id", "created_at", "person", "block", "season", "body", "latitude", "longitude", "weather_temp", "weather_humidity", "weather_condition"],
      rows.map((row) => [
        row.id,
        row.createdAt.toISOString(),
        row.person,
        row.block,
        row.season,
        row.body,
        row.latitude,
        row.longitude,
        row.weatherTemp,
        row.weatherHumidity,
        row.weatherCondition,
      ]),
    );

    return sendCsv(reply, "veldnotas.csv", csv);
  });

  app.get("/export/harvest.csv", { preHandler: requireStaff(deps.env.staffSessionSecret, ["admin", "owner"]) }, async (request, reply) => {
    const farmId = request.staff!.farmId;

    const rows = await deps.db
      .select({
        id: harvestEvents.id,
        createdAt: harvestEvents.createdAt,
        person: people.name,
        block: blocks.name,
        season: seasons.name,
        weightKg: harvestEvents.weightKg,
        deductionKg: harvestEvents.deductionKg,
        weatherTemp: harvestEvents.weatherTemp,
        weatherHumidity: harvestEvents.weatherHumidity,
        weatherCondition: harvestEvents.weatherCondition,
      })
      .from(harvestEvents)
      .leftJoin(people, eq(people.id, harvestEvents.createdBy))
      .leftJoin(blocks, eq(blocks.id, harvestEvents.blockId))
      .leftJoin(seasons, eq(seasons.id, harvestEvents.seasonId))
      .where(eq(harvestEvents.farmId, farmId))
      .orderBy(asc(harvestEvents.createdAt));

    const csv = toCsv(
      ["id", "created_at", "person", "block", "season", "weight_kg", "deduction_kg", "weather_temp", "weather_humidity", "weather_condition"],
      rows.map((row) => [
        row.id,
        row.createdAt.toISOString(),
        row.person,
        row.block,
        row.season,
        row.weightKg,
        row.deductionKg,
        row.weatherTemp,
        row.weatherHumidity,
        row.weatherCondition,
      ]),
    );

    return sendCsv(reply, "boord.csv", csv);
  });

  /**
   * Span's punches, raw (docs/span-build-scope.md) — one row per punch, not
   * the paired-up hours Eienaar shows. The farm's own data goes out as it was
   * captured; whoever opens this in Excel can pair it however their payroll
   * actually works, which is not something Plaashek decides for them.
   */
  app.get("/export/attendance.csv", { preHandler: requireStaff(deps.env.staffSessionSecret, ["admin", "owner"]) }, async (request, reply) => {
    const farmId = request.staff!.farmId;

    const rows = await deps.db
      .select({
        id: attendancePunches.id,
        createdAt: attendancePunches.createdAt,
        person: people.name,
        direction: attendancePunches.direction,
        season: seasons.name,
        latitude: attendancePunches.latitude,
        longitude: attendancePunches.longitude,
      })
      .from(attendancePunches)
      .leftJoin(people, eq(people.id, attendancePunches.createdBy))
      .leftJoin(seasons, eq(seasons.id, attendancePunches.seasonId))
      .where(eq(attendancePunches.farmId, farmId))
      .orderBy(asc(attendancePunches.createdAt));

    const csv = toCsv(
      ["id", "created_at", "person", "direction", "season", "latitude", "longitude"],
      rows.map((row) => [row.id, row.createdAt.toISOString(), row.person, row.direction, row.season, row.latitude, row.longitude]),
    );

    return sendCsv(reply, "span.csv", csv);
  });
}
