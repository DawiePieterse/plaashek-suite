import { harvestEvents, people, pieceRates } from "@plaashek/schema";
import { and, asc, desc, eq, gte, isNull, lte, ne, sql } from "drizzle-orm";
import type { App, AppDeps } from "../app.js";
import { requireStaff } from "../auth/require-staff.js";
import type { Db } from "../db.js";
import { logAudit } from "../lib/audit.js";
import { parseCsv, sendCsv, toCsv } from "../lib/csv.js";
import { requireDeviceTicket } from "../lib/device-ticket.js";
import { conflict, notFound } from "../lib/errors.js";
import { farmDayEnd, farmDayStart } from "../lib/farm-day.js";
import { activeSeason } from "../lib/farm.js";
import { netKg, rollUpPiecework, type Crate } from "../lib/piecework.js";
import { normaliseWorkerNumber } from "../lib/worker-number.js";
import {
  createPieceRateRequestSchema,
  createWorkerRequestSchema,
  payoutQuerySchema,
  updateWorkerRequestSchema,
} from "../schemas/piecework.js";

/**
 * A number belongs to one worker on a farm (ADR 0011) — the office owns the
 * numbering, so the one thing we enforce is that they have not handed the
 * same number to two people. `exceptPersonId` lets an edit keep its own.
 */
async function numberTaken(db: Pick<Db, "select">, farmId: string, workerNumber: string, exceptPersonId?: string) {
  const [clash] = await db
    .select({ id: people.id })
    .from(people)
    .where(
      and(
        eq(people.farmId, farmId),
        eq(people.workerNumber, workerNumber),
        ...(exceptPersonId ? [ne(people.id, exceptPersonId)] : []),
      ),
    );

  return Boolean(clash);
}

async function seasonalWorker(db: Pick<Db, "select">, farmId: string, personId: string) {
  const [person] = await db
    .select({ id: people.id, name: people.name, workerNumber: people.workerNumber })
    .from(people)
    .where(and(eq(people.id, personId), eq(people.farmId, farmId), eq(people.kind, "seasonal")));

  return person ?? null;
}

export function registerPieceworkRoutes(app: App, deps: AppDeps) {
  /** The seasonal register (docs/piecework-build-scope.md): the farm's numbered pickers, in number order. */
  app.get("/piecework/workers", { preHandler: requireStaff(deps.env.staffSessionSecret, ["admin", "owner"]) }, async (request) => {
    const farmId = request.staff!.farmId;

    const workers = await deps.db
      .select({ personId: people.id, name: people.name, workerNumber: people.workerNumber, active: people.active })
      .from(people)
      .where(and(eq(people.farmId, farmId), eq(people.kind, "seasonal")))
      .orderBy(asc(people.workerNumber), asc(people.name));

    return { workers };
  });

  /** The office types the number (ADR 0011). We only check it is not already someone else's. */
  app.post("/piecework/workers", { preHandler: requireStaff(deps.env.staffSessionSecret, ["admin"]) }, async (request) => {
    const staff = request.staff!;
    const body = createWorkerRequestSchema.parse(request.body);
    const workerNumber = normaliseWorkerNumber(body.workerNumber);

    if (await numberTaken(deps.db, staff.farmId, workerNumber)) {
      throw conflict("worker_number_taken", `Another worker already has number ${workerNumber}`);
    }

    return deps.db.transaction(async (tx) => {
      const [person] = await tx
        .insert(people)
        .values({ farmId: staff.farmId, name: body.name, kind: "seasonal", workerNumber })
        .returning();

      await logAudit(tx, { actor: staff.farmMembershipId, action: "register_seasonal_worker", target: person.id, farmId: staff.farmId });

      return { person };
    });
  });

  /**
   * Fix a typo, renumber someone, or mark a worker who has left inactive.
   * Nothing here touches crates already captured: a renumbered worker keeps
   * every crate attributed to their person, and `picker_card_code` still
   * shows the number that was actually scanned at the time.
   */
  app.patch("/piecework/workers/:personId", { preHandler: requireStaff(deps.env.staffSessionSecret, ["admin"]) }, async (request) => {
    const staff = request.staff!;
    const { personId } = request.params as { personId: string };
    const body = updateWorkerRequestSchema.parse(request.body);

    if (!(await seasonalWorker(deps.db, staff.farmId, personId))) throw notFound();

    const workerNumber = body.workerNumber === undefined ? undefined : normaliseWorkerNumber(body.workerNumber);
    if (workerNumber && (await numberTaken(deps.db, staff.farmId, workerNumber, personId))) {
      throw conflict("worker_number_taken", `Another worker already has number ${workerNumber}`);
    }

    return deps.db.transaction(async (tx) => {
      const [person] = await tx
        .update(people)
        .set({
          ...(body.name === undefined ? {} : { name: body.name }),
          ...(workerNumber === undefined ? {} : { workerNumber }),
          ...(body.active === undefined ? {} : { active: body.active }),
        })
        .where(eq(people.id, personId))
        .returning();

      await logAudit(tx, { actor: staff.farmMembershipId, action: "edit_seasonal_worker", target: personId, farmId: staff.farmId });

      return { person };
    });
  });

  /**
   * The register, in and out as CSV, keyed on the farm's own worker number
   * (ADR 0011) — that is what makes the payment system's file and this list
   * the same list.
   */
  app.get("/export/workers.csv", { preHandler: requireStaff(deps.env.staffSessionSecret, ["admin", "owner"]) }, async (request, reply) => {
    const farmId = request.staff!.farmId;

    const workers = await deps.db
      .select({ workerNumber: people.workerNumber, name: people.name, active: people.active })
      .from(people)
      .where(and(eq(people.farmId, farmId), eq(people.kind, "seasonal")))
      .orderBy(asc(people.workerNumber), asc(people.name));

    const csv = toCsv(
      ["worker_number", "name", "active"],
      workers.map((worker) => [worker.workerNumber, worker.name, worker.active ? "yes" : "no"]),
    );

    return sendCsv(reply, "werkers.csv", csv);
  });

  /**
   * The same file back again: `worker_number` decides who each row is, so a
   * number the farm already knows is updated and a new one is added. Nothing
   * is deleted — a worker missing from the file has not resigned, they are
   * just not in that file; mark them inactive deliberately instead.
   *
   * A row the farm cannot act on (no number, a blank name, the same number
   * twice in one file) is reported back rather than guessed at, and the
   * rows around it still land.
   */
  app.post("/piecework/workers/import", { preHandler: requireStaff(deps.env.staffSessionSecret, ["admin"]) }, async (request) => {
    const staff = request.staff!;
    const rows = parseCsv(typeof request.body === "string" ? request.body : "");

    const existing = await deps.db
      .select({ id: people.id, workerNumber: people.workerNumber })
      .from(people)
      .where(and(eq(people.farmId, staff.farmId), eq(people.kind, "seasonal")));
    const byNumber = new Map(existing.filter((row) => row.workerNumber).map((row) => [row.workerNumber!, row.id]));

    // A code, not a sentence: the office tools word it in the farm's language.
    const skipped: { row: number; reason: "no_number" | "no_name" | "duplicate_number"; workerNumber?: string }[] = [];
    const seen = new Set<string>();
    let created = 0;
    let updated = 0;

    await deps.db.transaction(async (tx) => {
      for (const [index, row] of rows.entries()) {
        // The header line is row 1 in the file the office is looking at.
        const line = index + 2;
        const workerNumber = normaliseWorkerNumber(row["worker_number"] ?? row["number"] ?? "");
        const name = (row["name"] ?? row["full_name"] ?? "").trim();
        const active = !/^(no|nee|false|0|inactive)$/i.test(row["active"] ?? "");

        if (!workerNumber) {
          skipped.push({ row: line, reason: "no_number" });
          continue;
        }
        if (!name) {
          skipped.push({ row: line, reason: "no_name" });
          continue;
        }
        if (seen.has(workerNumber)) {
          skipped.push({ row: line, reason: "duplicate_number", workerNumber });
          continue;
        }
        seen.add(workerNumber);

        const personId = byNumber.get(workerNumber);
        if (personId) {
          await tx.update(people).set({ name, active }).where(eq(people.id, personId));
          updated += 1;
        } else {
          await tx.insert(people).values({ farmId: staff.farmId, name, kind: "seasonal", workerNumber, active });
          created += 1;
        }
      }

      await logAudit(tx, { actor: staff.farmMembershipId, action: "import_seasonal_workers", target: staff.farmId, farmId: staff.farmId });
    });

    return { created, updated, skipped };
  });

  /**
   * The phone's copy of the register, cached on the device the same way
   * blocks are so a scan resolves with no signal (docs/piecework-build-scope.md).
   * Device-ticket-gated: it names the farm's workers, so it is not something
   * a phone gets before it is paired.
   */
  app.get("/pickers", async (request) => {
    const claims = await requireDeviceTicket(request.headers, deps);

    const pickers = await deps.db
      .select({ workerNumber: people.workerNumber, personId: people.id, personName: people.name })
      .from(people)
      .where(and(eq(people.farmId, claims.farmId), eq(people.kind, "seasonal"), eq(people.active, true), sql`${people.workerNumber} is not null`))
      .orderBy(asc(people.workerNumber));

    return { pickers };
  });

  app.get("/piece-rates", { preHandler: requireStaff(deps.env.staffSessionSecret, ["admin", "owner"]) }, async (request) => {
    const farmId = request.staff!.farmId;

    const season = await activeSeason(deps.db, farmId);
    if (!season) return { season: null, rates: [] };

    const rates = await deps.db
      .select()
      .from(pieceRates)
      .where(and(eq(pieceRates.farmId, farmId), eq(pieceRates.seasonId, season.id)))
      .orderBy(desc(pieceRates.effectiveFrom));

    return { season: { id: season.id, name: season.name }, rates };
  });

  /** A rate change is a new row, never an edit — last week keeps the rate it was picked under (ADR 0010). */
  app.post("/piece-rates", { preHandler: requireStaff(deps.env.staffSessionSecret, ["admin"]) }, async (request) => {
    const staff = request.staff!;
    const body = createPieceRateRequestSchema.parse(request.body);

    const season = await activeSeason(deps.db, staff.farmId);
    if (!season) throw notFound("No active season to set a rate for");

    return deps.db.transaction(async (tx) => {
      const [rate] = await tx
        .insert(pieceRates)
        .values({
          farmId: staff.farmId,
          seasonId: season.id,
          effectiveFrom: body.effectiveFrom,
          baseCentsPerKg: body.baseCentsPerKg,
          targetKg: body.targetKg ?? null,
          bonusCentsPerKg: body.bonusCentsPerKg ?? null,
        })
        .returning();

      await logAudit(tx, { actor: staff.farmMembershipId, action: "set_piece_rate", target: rate.id, farmId: staff.farmId });

      return { rate };
    });
  });

  /**
   * What the office pays out: kilograms and rand per picker for a period,
   * defaulting to the active season. Derived at read time (ADR 0010) — pull
   * it again after a late sync rather than trusting yesterday's copy.
   */
  app.get("/piecework/payout", { preHandler: requireStaff(deps.env.staffSessionSecret, ["admin", "owner"]) }, async (request) => {
    const farmId = request.staff!.farmId;
    const query = payoutQuerySchema.parse(request.query);

    const season = await activeSeason(deps.db, farmId);
    if (!season) return { season: null, from: null, to: null, people: [], unattributedCrates: 0, unattributedKg: 0 };

    const from = query.from ?? season.startsOn;
    const to = query.to ?? season.endsOn;

    // Both reads depend only on the season, not on each other.
    const [crateRows, rates] = await Promise.all([
      deps.db
        .select({
          pickerId: harvestEvents.pickerId,
          pickerName: people.name,
          at: harvestEvents.createdAt,
          weightKg: harvestEvents.weightKg,
          deductionKg: harvestEvents.deductionKg,
        })
        .from(harvestEvents)
        .leftJoin(people, eq(people.id, harvestEvents.pickerId))
        .where(
          and(
            eq(harvestEvents.farmId, farmId),
            eq(harvestEvents.seasonId, season.id),
            gte(harvestEvents.createdAt, farmDayStart(from)),
            lte(harvestEvents.createdAt, farmDayEnd(to)),
          ),
        ),
      deps.db
        .select({
          effectiveFrom: pieceRates.effectiveFrom,
          baseCentsPerKg: pieceRates.baseCentsPerKg,
          targetKg: pieceRates.targetKg,
          bonusCentsPerKg: pieceRates.bonusCentsPerKg,
        })
        .from(pieceRates)
        .where(and(eq(pieceRates.farmId, farmId), eq(pieceRates.seasonId, season.id))),
    ]);

    const attributed: Crate[] = [];
    let unattributedCrates = 0;
    let unattributedKg = 0;

    for (const row of crateRows) {
      const kg = netKg(row.weightKg, row.deductionKg);
      // A crate whose card never resolved is not nobody's work — it is work
      // the office still has to place, so it is counted and shown, not dropped.
      if (!row.pickerId || !row.pickerName) {
        unattributedCrates += 1;
        unattributedKg += kg;
        continue;
      }
      attributed.push({ pickerId: row.pickerId, pickerName: row.pickerName, at: row.at, netKg: kg });
    }

    return {
      season: { id: season.id, name: season.name },
      from,
      to,
      people: rollUpPiecework(attributed, rates),
      unattributedCrates,
      unattributedKg: Math.round(unattributedKg * 100) / 100,
    };
  });

  /** Crates the office still has to place: a card was scanned but nothing matched it, or none was scanned at all. */
  app.get("/piecework/unattributed", { preHandler: requireStaff(deps.env.staffSessionSecret, ["admin", "owner"]) }, async (request) => {
    const farmId = request.staff!.farmId;

    const crates = await deps.db
      .select({
        id: harvestEvents.id,
        createdAt: harvestEvents.createdAt,
        weightKg: harvestEvents.weightKg,
        scannedNumber: harvestEvents.pickerCardCode,
      })
      .from(harvestEvents)
      .where(and(eq(harvestEvents.farmId, farmId), isNull(harvestEvents.pickerId), sql`${harvestEvents.pickerCardCode} is not null`))
      .orderBy(desc(harvestEvents.createdAt))
      .limit(200);

    return { crates };
  });
}
