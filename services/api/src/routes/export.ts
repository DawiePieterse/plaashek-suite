import { assets, attendancePunches, blocks, fuelLogs, harvestEvents, meterReadings, notes, people, pieceRates, seasons, workOrders } from "@plaashek/schema";
import { and, asc, eq } from "drizzle-orm";
import type { App, AppDeps } from "../app.js";
import { requireStaff } from "../auth/require-staff.js";
import { sendCsv, toCsv } from "../lib/csv.js";
import { farmDayKey } from "../lib/farm-day.js";
import { dayCents, netKg, rateOn, type Rate } from "../lib/piecework.js";

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

  /** Water's raw readings (docs/water-build-scope.md) — one row per reading, no active-season filter (season-less). */
  app.get("/export/water.csv", { preHandler: requireStaff(deps.env.staffSessionSecret, ["admin", "owner"]) }, async (request, reply) => {
    const farmId = request.staff!.farmId;

    const rows = await deps.db
      .select({
        id: meterReadings.id,
        createdAt: meterReadings.createdAt,
        person: people.name,
        asset: assets.name,
        reading: meterReadings.reading,
        note: meterReadings.note,
      })
      .from(meterReadings)
      .leftJoin(people, eq(people.id, meterReadings.createdBy))
      .leftJoin(assets, eq(assets.id, meterReadings.assetId))
      .where(eq(meterReadings.farmId, farmId))
      .orderBy(asc(meterReadings.createdAt));

    const csv = toCsv(
      ["id", "created_at", "person", "asset", "reading", "note"],
      rows.map((row) => [row.id, row.createdAt.toISOString(), row.person, row.asset, row.reading, row.note]),
    );

    return sendCsv(reply, "water.csv", csv);
  });

  /** Werkswinkel's fuel register (docs/werkswinkel-build-scope.md) — one row per fill-up. */
  app.get("/export/fuel.csv", { preHandler: requireStaff(deps.env.staffSessionSecret, ["admin", "owner"]) }, async (request, reply) => {
    const farmId = request.staff!.farmId;

    const rows = await deps.db
      .select({
        id: fuelLogs.id,
        createdAt: fuelLogs.createdAt,
        person: people.name,
        asset: assets.name,
        litresUsed: fuelLogs.litresUsed,
        odometerKm: fuelLogs.odometerKm,
        note: fuelLogs.note,
      })
      .from(fuelLogs)
      .leftJoin(people, eq(people.id, fuelLogs.createdBy))
      .leftJoin(assets, eq(assets.id, fuelLogs.assetId))
      .where(eq(fuelLogs.farmId, farmId))
      .orderBy(asc(fuelLogs.createdAt));

    const csv = toCsv(
      ["id", "created_at", "person", "asset", "litres_used", "odometer_km", "note"],
      rows.map((row) => [row.id, row.createdAt.toISOString(), row.person, row.asset, row.litresUsed, row.odometerKm, row.note]),
    );

    return sendCsv(reply, "fuel.csv", csv);
  });

  /** Werkswinkel's issue register (docs/werkswinkel-build-scope.md) — every reported event, not just what is currently open. */
  app.get("/export/work-orders.csv", { preHandler: requireStaff(deps.env.staffSessionSecret, ["admin", "owner"]) }, async (request, reply) => {
    const farmId = request.staff!.farmId;

    const rows = await deps.db
      .select({
        id: workOrders.id,
        createdAt: workOrders.createdAt,
        person: people.name,
        asset: assets.name,
        description: workOrders.description,
        status: workOrders.status,
      })
      .from(workOrders)
      .leftJoin(people, eq(people.id, workOrders.createdBy))
      .leftJoin(assets, eq(assets.id, workOrders.assetId))
      .where(eq(workOrders.farmId, farmId))
      .orderBy(asc(workOrders.createdAt));

    const csv = toCsv(
      ["id", "created_at", "person", "asset", "description", "status"],
      rows.map((row) => [row.id, row.createdAt.toISOString(), row.person, row.asset, row.description, row.status]),
    );

    return sendCsv(reply, "work-orders.csv", csv);
  });

  /**
   * The file payroll actually uses (ADR 0010): one row per picker per day,
   * with the rate that was in force on that day spelled out beside it so the
   * rand can be checked rather than trusted. Crates whose card never resolved
   * are in here too, with an empty picker and the code that was scanned —
   * they are work the office still has to place, not work that disappears.
   *
   * It is not a payslip and it is not a minimum-wage check: no hours exist
   * for a seasonal picker (ADR 0008, ADR 0010).
   */
  app.get("/export/piecework.csv", { preHandler: requireStaff(deps.env.staffSessionSecret, ["admin", "owner"]) }, async (request, reply) => {
    const farmId = request.staff!.farmId;

    const [crates, rateRows] = await Promise.all([
      deps.db
        .select({
          at: harvestEvents.createdAt,
          pickerId: harvestEvents.pickerId,
          picker: people.name,
          cardCode: harvestEvents.pickerCardCode,
          season: seasons.name,
          seasonId: harvestEvents.seasonId,
          weightKg: harvestEvents.weightKg,
          deductionKg: harvestEvents.deductionKg,
        })
        .from(harvestEvents)
        .leftJoin(people, eq(people.id, harvestEvents.pickerId))
        .leftJoin(seasons, eq(seasons.id, harvestEvents.seasonId))
        .where(eq(harvestEvents.farmId, farmId))
        .orderBy(asc(harvestEvents.createdAt)),
      deps.db
        .select({
          seasonId: pieceRates.seasonId,
          effectiveFrom: pieceRates.effectiveFrom,
          baseCentsPerKg: pieceRates.baseCentsPerKg,
          targetKg: pieceRates.targetKg,
          bonusCentsPerKg: pieceRates.bonusCentsPerKg,
        })
        .from(pieceRates)
        .where(eq(pieceRates.farmId, farmId)),
    ]);

    // Grouped once, not re-filtered for every row of the file.
    const ratesBySeason = new Map<string | null, Rate[]>();
    for (const rate of rateRows) {
      const forSeason = ratesBySeason.get(rate.seasonId) ?? [];
      forSeason.push(rate);
      ratesBySeason.set(rate.seasonId, forSeason);
    }

    // picker+day is the pay unit: the tier is daily, and rounding happens once per day.
    const buckets = new Map<string, { day: string; picker: string | null; cardCode: string | null; season: string | null; seasonId: string | null; kg: number }>();

    for (const crate of crates) {
      const day = farmDayKey(crate.at);
      const key = `${crate.pickerId ?? `card:${crate.cardCode ?? "none"}`}|${day}`;
      const bucket = buckets.get(key) ?? {
        day,
        picker: crate.picker,
        cardCode: crate.cardCode,
        season: crate.season,
        seasonId: crate.seasonId,
        kg: 0,
      };
      bucket.kg += netKg(crate.weightKg, crate.deductionKg);
      buckets.set(key, bucket);
    }

    const rows = [...buckets.values()]
      // Day, then named pickers, then the day's unplaced crates at the bottom
      // where payroll can see what is still missing rather than scrolling past it.
      .sort(
        (a, b) =>
          a.day.localeCompare(b.day) ||
          Number(a.picker === null) - Number(b.picker === null) ||
          (a.picker ?? a.cardCode ?? "").localeCompare(b.picker ?? b.cardCode ?? ""),
      )
      .map((bucket) => {
        const rate = rateOn(bucket.day, ratesBySeason.get(bucket.seasonId) ?? []);
        const kg = Math.round(bucket.kg * 100) / 100;
        // No picker means no pay line — the kilograms are real, whose they are is not yet known.
        const cents = rate && bucket.picker ? dayCents(bucket.kg, rate) : null;

        return [
          bucket.day,
          bucket.picker,
          bucket.cardCode,
          bucket.season,
          kg,
          rate?.baseCentsPerKg ?? null,
          rate?.targetKg ?? null,
          rate?.bonusCentsPerKg ?? null,
          cents,
          cents === null ? null : (cents / 100).toFixed(2),
        ];
      });

    const csv = toCsv(
      ["day", "picker", "card_code", "season", "net_kg", "base_cents_per_kg", "target_kg", "bonus_cents_per_kg", "cents", "rand"],
      rows,
    );

    return sendCsv(reply, "stukwerk.csv", csv);
  });
}
