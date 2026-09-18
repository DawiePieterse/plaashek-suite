import { harvestEvents, people, pieceRates, seasons, workerCards } from "@plaashek/schema";
import { and, asc, desc, eq, gte, isNull, lte, sql } from "drizzle-orm";
import type { App, AppDeps } from "../app.js";
import { requireStaff } from "../auth/require-staff.js";
import type { Db } from "../db.js";
import { logAudit } from "../lib/audit.js";
import { requireDeviceTicket } from "../lib/device-ticket.js";
import { notFound } from "../lib/errors.js";
import { rollUpPiecework, type Crate } from "../lib/piecework.js";
import { randomCardCode } from "../lib/worker-card.js";
import { createPieceRateRequestSchema, createWorkerRequestSchema, payoutQuerySchema } from "../schemas/piecework.js";

/** A day's start and end in UTC, from a farm-local `YYYY-MM-DD`. SAST is UTC+2, no DST (lib/farm-day.ts). */
const SAST_OFFSET = "+02:00";
const dayStart = (day: string) => new Date(`${day}T00:00:00${SAST_OFFSET}`);
const dayEnd = (day: string) => new Date(`${day}T23:59:59.999${SAST_OFFSET}`);

/** Issues a card for a person, standing down whatever card they hold now — a reissue is a new code, never an edit (ADR 0009). */
async function issueCard(tx: Pick<Db, "update" | "insert">, farmId: string, personId: string, issuedBy: string) {
  await tx
    .update(workerCards)
    .set({ revokedAt: new Date() })
    .where(and(eq(workerCards.farmId, farmId), eq(workerCards.personId, personId), isNull(workerCards.revokedAt)));

  const [card] = await tx
    .insert(workerCards)
    .values({ farmId, personId, code: randomCardCode(), issuedBy })
    .returning();

  return card;
}

export function registerPieceworkRoutes(app: App, deps: AppDeps) {
  /**
   * The seasonal register (docs/piecework-build-scope.md): every seasonal
   * person with the card they currently hold, plus what they have picked
   * so far this season.
   */
  app.get("/piecework/workers", { preHandler: requireStaff(deps.env.staffSessionSecret, ["admin", "owner"]) }, async (request) => {
    const farmId = request.staff!.farmId;

    const workers = await deps.db
      .select({
        personId: people.id,
        name: people.name,
        cardId: workerCards.id,
        code: workerCards.code,
        issuedAt: workerCards.issuedAt,
      })
      .from(people)
      .leftJoin(workerCards, and(eq(workerCards.personId, people.id), isNull(workerCards.revokedAt)))
      .where(and(eq(people.farmId, farmId), eq(people.kind, "seasonal")))
      .orderBy(asc(people.name));

    return { workers };
  });

  /** Registering a worker creates the person and their first card in one step — the office never wants one without the other. */
  app.post("/piecework/workers", { preHandler: requireStaff(deps.env.staffSessionSecret, ["admin"]) }, async (request) => {
    const staff = request.staff!;
    const { name } = createWorkerRequestSchema.parse(request.body);

    return deps.db.transaction(async (tx) => {
      const [person] = await tx.insert(people).values({ farmId: staff.farmId, name, kind: "seasonal" }).returning();
      const card = await issueCard(tx, staff.farmId, person.id, staff.farmMembershipId);

      await logAudit(tx, { actor: staff.farmMembershipId, action: "register_seasonal_worker", target: person.id, farmId: staff.farmId });

      return { person, card };
    });
  });

  /** Lost, muddy or wrongly held card: revoke it and print a new code. The old code stays on every crate it ever stamped. */
  app.post("/piecework/workers/:personId/card", { preHandler: requireStaff(deps.env.staffSessionSecret, ["admin"]) }, async (request) => {
    const staff = request.staff!;
    const { personId } = request.params as { personId: string };

    const [person] = await deps.db
      .select({ id: people.id })
      .from(people)
      .where(and(eq(people.id, personId), eq(people.farmId, staff.farmId), eq(people.kind, "seasonal")));
    if (!person) throw notFound();

    return deps.db.transaction(async (tx) => {
      const card = await issueCard(tx, staff.farmId, personId, staff.farmMembershipId);
      await logAudit(tx, { actor: staff.farmMembershipId, action: "reissue_worker_card", target: personId, farmId: staff.farmId });
      return { card };
    });
  });

  /** Revoke without reissuing — the worker has left. Their crates keep their attribution. */
  app.post("/piecework/cards/:cardId/revoke", { preHandler: requireStaff(deps.env.staffSessionSecret, ["admin"]) }, async (request) => {
    const staff = request.staff!;
    const { cardId } = request.params as { cardId: string };

    const [card] = await deps.db
      .update(workerCards)
      .set({ revokedAt: new Date() })
      .where(and(eq(workerCards.id, cardId), eq(workerCards.farmId, staff.farmId), isNull(workerCards.revokedAt)))
      .returning();
    if (!card) throw notFound();

    await logAudit(deps.db, { actor: staff.farmMembershipId, action: "revoke_worker_card", target: cardId, farmId: staff.farmId });

    return { card };
  });

  /**
   * The phone's copy of the card list, cached on the device the same way
   * blocks are so a scan resolves with no signal (docs/piecework-build-scope.md).
   * Device-ticket-gated: it names the farm's seasonal workers, so it is not
   * something a phone gets before it is paired.
   */
  app.get("/worker-cards", async (request) => {
    const claims = await requireDeviceTicket(request.headers, deps);

    const cards = await deps.db
      .select({ code: workerCards.code, personId: people.id, personName: people.name })
      .from(workerCards)
      .innerJoin(people, eq(people.id, workerCards.personId))
      .where(and(eq(workerCards.farmId, claims.farmId), isNull(workerCards.revokedAt)))
      .orderBy(asc(people.name));

    return { cards };
  });

  app.get("/piece-rates", { preHandler: requireStaff(deps.env.staffSessionSecret, ["admin", "owner"]) }, async (request) => {
    const farmId = request.staff!.farmId;

    const [activeSeason] = await deps.db
      .select({ id: seasons.id, name: seasons.name })
      .from(seasons)
      .where(and(eq(seasons.farmId, farmId), eq(seasons.isActive, true)));

    if (!activeSeason) return { season: null, rates: [] };

    const rates = await deps.db
      .select()
      .from(pieceRates)
      .where(and(eq(pieceRates.farmId, farmId), eq(pieceRates.seasonId, activeSeason.id)))
      .orderBy(desc(pieceRates.effectiveFrom));

    return { season: activeSeason, rates };
  });

  /** A rate change is a new row, never an edit — last week keeps the rate it was picked under (ADR 0010). */
  app.post("/piece-rates", { preHandler: requireStaff(deps.env.staffSessionSecret, ["admin"]) }, async (request) => {
    const staff = request.staff!;
    const body = createPieceRateRequestSchema.parse(request.body);

    const [activeSeason] = await deps.db
      .select({ id: seasons.id })
      .from(seasons)
      .where(and(eq(seasons.farmId, staff.farmId), eq(seasons.isActive, true)));
    if (!activeSeason) throw notFound("No active season to set a rate for");

    return deps.db.transaction(async (tx) => {
      const [rate] = await tx
        .insert(pieceRates)
        .values({
          farmId: staff.farmId,
          seasonId: activeSeason.id,
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

    const [activeSeason] = await deps.db
      .select({ id: seasons.id, name: seasons.name, startsOn: seasons.startsOn, endsOn: seasons.endsOn })
      .from(seasons)
      .where(and(eq(seasons.farmId, farmId), eq(seasons.isActive, true)));

    if (!activeSeason) return { season: null, from: null, to: null, people: [], unattributedCrates: 0, unattributedKg: 0 };

    const from = query.from ?? activeSeason.startsOn;
    const to = query.to ?? activeSeason.endsOn;

    const crateRows = await deps.db
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
          eq(harvestEvents.seasonId, activeSeason.id),
          gte(harvestEvents.createdAt, dayStart(from)),
          lte(harvestEvents.createdAt, dayEnd(to)),
        ),
      );

    const rates = await deps.db
      .select({
        effectiveFrom: pieceRates.effectiveFrom,
        baseCentsPerKg: pieceRates.baseCentsPerKg,
        targetKg: pieceRates.targetKg,
        bonusCentsPerKg: pieceRates.bonusCentsPerKg,
      })
      .from(pieceRates)
      .where(and(eq(pieceRates.farmId, farmId), eq(pieceRates.seasonId, activeSeason.id)));

    const attributed: Crate[] = [];
    let unattributedCrates = 0;
    let unattributedKg = 0;

    for (const row of crateRows) {
      const netKg = row.weightKg - (row.deductionKg ?? 0);
      // A crate whose card never resolved is not nobody's work — it is work
      // the office still has to place, so it is counted and shown, not dropped.
      if (!row.pickerId || !row.pickerName) {
        unattributedCrates += 1;
        unattributedKg += netKg;
        continue;
      }
      attributed.push({ pickerId: row.pickerId, pickerName: row.pickerName, at: row.at, netKg });
    }

    return {
      season: { id: activeSeason.id, name: activeSeason.name },
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
        cardCode: harvestEvents.pickerCardCode,
      })
      .from(harvestEvents)
      .where(and(eq(harvestEvents.farmId, farmId), isNull(harvestEvents.pickerId), sql`${harvestEvents.pickerCardCode} is not null`))
      .orderBy(desc(harvestEvents.createdAt))
      .limit(200);

    return { crates };
  });
}
