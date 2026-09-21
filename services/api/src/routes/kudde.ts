import { animals, camps, movements, treatments, weights } from "@plaashek/schema";
import { and, asc, desc, eq, ne } from "drizzle-orm";
import type { App, AppDeps } from "../app.js";
import { requireStaff } from "../auth/require-staff.js";
import type { Db } from "../db.js";
import { logAudit } from "../lib/audit.js";
import { requireDeviceTicket } from "../lib/device-ticket.js";
import { activeSeason } from "../lib/farm.js";
import { conflict, notFound } from "../lib/errors.js";
import { normaliseWorkerNumber } from "../lib/worker-number.js";
import { createAnimalRequestSchema, updateAnimalRequestSchema } from "../schemas/kudde.js";

/**
 * A tag belongs to one animal on a farm (ADR 0011's pattern, ADR 0014) — the
 * office owns the numbering, so the one thing enforced here is that it has
 * not been handed to two animals. `exceptAnimalId` lets an edit keep its own.
 */
async function tagTaken(db: Pick<Db, "select">, farmId: string, tagNumber: string, exceptAnimalId?: string) {
  const [clash] = await db
    .select({ id: animals.id })
    .from(animals)
    .where(and(eq(animals.farmId, farmId), eq(animals.tagNumber, tagNumber), ...(exceptAnimalId ? [ne(animals.id, exceptAnimalId)] : [])));

  return Boolean(clash);
}

async function farmAnimal(db: Pick<Db, "select">, farmId: string, animalId: string) {
  const [animal] = await db.select({ id: animals.id }).from(animals).where(and(eq(animals.id, animalId), eq(animals.farmId, farmId)));
  return animal ?? null;
}

/**
 * Kudde (plan §11, docs/kudde-build-scope.md): the register, the phone's
 * offline-safe copy of it, and the office's own rollup. `/export/animals.csv`,
 * `/export/movements.csv`, `/export/treatments.csv` and `/export/weights.csv`
 * live with the other exports in `export.ts`.
 */
export function registerKuddeRoutes(app: App, deps: AppDeps) {
  /** The register (docs/kudde-build-scope.md): every animal the farm has recorded, tag order. */
  app.get("/animals", { preHandler: requireStaff(deps.env.staffSessionSecret, ["admin", "owner"]) }, async (request) => {
    const farmId = request.staff!.farmId;

    const rows = await deps.db
      .select({ id: animals.id, tagNumber: animals.tagNumber, sex: animals.sex, breed: animals.breed, birthDate: animals.birthDate, active: animals.active })
      .from(animals)
      .where(eq(animals.farmId, farmId))
      .orderBy(asc(animals.tagNumber));

    return { animals: rows };
  });

  /** The office types the tag (ADR 0011's pattern). We only check it is not already another animal's. */
  app.post("/animals", { preHandler: requireStaff(deps.env.staffSessionSecret, ["admin"]) }, async (request) => {
    const staff = request.staff!;
    const body = createAnimalRequestSchema.parse(request.body);
    const tagNumber = body.tagNumber ? normaliseWorkerNumber(body.tagNumber) : null;

    if (tagNumber && (await tagTaken(deps.db, staff.farmId, tagNumber))) {
      throw conflict("tag_number_taken", `Another animal already has tag ${tagNumber}`);
    }

    return deps.db.transaction(async (tx) => {
      const [animal] = await tx
        .insert(animals)
        .values({ farmId: staff.farmId, tagNumber, sex: body.sex, breed: body.breed ?? null, birthDate: body.birthDate ?? null })
        .returning();

      await logAudit(tx, { actor: staff.farmMembershipId, action: "register_animal", target: animal.id, farmId: staff.farmId });

      return { animal };
    });
  });

  /**
   * Fix a tag, correct the sex or breed, or mark an animal sold or dead
   * inactive. Nothing here touches movements, treatments or weights already
   * captured — they keep their attribution, the same as a renumbered
   * piece-work worker keeps their crates (ADR 0011's precedent).
   */
  app.patch("/animals/:animalId", { preHandler: requireStaff(deps.env.staffSessionSecret, ["admin"]) }, async (request) => {
    const staff = request.staff!;
    const { animalId } = request.params as { animalId: string };
    const body = updateAnimalRequestSchema.parse(request.body);

    if (!(await farmAnimal(deps.db, staff.farmId, animalId))) throw notFound();

    const tagNumber = body.tagNumber === undefined ? undefined : body.tagNumber ? normaliseWorkerNumber(body.tagNumber) : null;
    if (tagNumber && (await tagTaken(deps.db, staff.farmId, tagNumber, animalId))) {
      throw conflict("tag_number_taken", `Another animal already has tag ${tagNumber}`);
    }

    return deps.db.transaction(async (tx) => {
      const [animal] = await tx
        .update(animals)
        .set({
          ...(tagNumber === undefined ? {} : { tagNumber }),
          ...(body.sex === undefined ? {} : { sex: body.sex }),
          ...(body.breed === undefined ? {} : { breed: body.breed }),
          ...(body.birthDate === undefined ? {} : { birthDate: body.birthDate }),
          ...(body.active === undefined ? {} : { active: body.active }),
        })
        .where(eq(animals.id, animalId))
        .returning();

      await logAudit(tx, { actor: staff.farmMembershipId, action: "edit_animal", target: animalId, farmId: staff.farmId });

      return { animal };
    });
  });

  /**
   * The phone's cached animal picker, active animals only — the same role
   * `/stock-catalog` and `/water-catalog` play for their screens.
   */
  app.get("/animal-catalog", async (request) => {
    const claims = await requireDeviceTicket(request.headers, deps);

    const rows = await deps.db
      .select({ id: animals.id, tagNumber: animals.tagNumber, sex: animals.sex })
      .from(animals)
      .where(and(eq(animals.farmId, claims.farmId), eq(animals.active, true)))
      .orderBy(asc(animals.tagNumber));

    return { animals: rows };
  });

  /**
   * Headcount per camp, derived from each active animal's most recent
   * movement (docs/kudde-build-scope.md) — like Stoor's on-hand total, this
   * is all-time, not season-scoped: a camp does not empty at a season
   * boundary. Treatment and weight history, by contrast, are reported for
   * the active season only, the same rule Harvest and Attendance follow.
   */
  app.get("/eienaar/kudde", { preHandler: requireStaff(deps.env.staffSessionSecret, ["admin", "owner"]) }, async (request) => {
    const farmId = request.staff!.farmId;

    const [activeAnimals, allMovements, farmCamps] = await Promise.all([
      deps.db.select({ id: animals.id }).from(animals).where(and(eq(animals.farmId, farmId), eq(animals.active, true))),
      // Newest first per animal — the first movement seen for an animal is where it is now.
      deps.db
        .select({ animalId: movements.animalId, toCampId: movements.toCampId })
        .from(movements)
        .where(eq(movements.farmId, farmId))
        .orderBy(desc(movements.createdAt)),
      deps.db.select({ id: camps.id, name: camps.name }).from(camps).where(eq(camps.farmId, farmId)),
    ]);

    const campNameById = new Map(farmCamps.map((camp) => [camp.id, camp.name]));

    const currentCampByAnimal = new Map<string, string>();
    for (const move of allMovements) {
      if (!currentCampByAnimal.has(move.animalId)) currentCampByAnimal.set(move.animalId, move.toCampId);
    }

    const headcountByCamp = new Map<string, number>();
    let unplaced = 0;
    for (const animal of activeAnimals) {
      const campId = currentCampByAnimal.get(animal.id);
      if (!campId) {
        unplaced += 1;
        continue;
      }
      headcountByCamp.set(campId, (headcountByCamp.get(campId) ?? 0) + 1);
    }

    const campsRollup = [...headcountByCamp.entries()]
      .map(([campId, headcount]) => ({ campId, campName: campNameById.get(campId) ?? campId, headcount }))
      .sort((a, b) => a.campName.localeCompare(b.campName));

    // No active season: nothing to roll up for treatments/weights yet, same rule Harvest and Attendance follow.
    // Headcount stands regardless — an animal's location is not a per-season fact.
    const season = await activeSeason(deps.db, farmId);
    if (!season) return { season: null, camps: campsRollup, unplaced, treatments: [], weights: [] };

    const [treatmentRows, weightRows] = await Promise.all([
      deps.db
        .select({
          id: treatments.id,
          at: treatments.createdAt,
          animalTag: animals.tagNumber,
          treatmentType: treatments.treatmentType,
          dose: treatments.dose,
          note: treatments.note,
        })
        .from(treatments)
        .leftJoin(animals, eq(animals.id, treatments.animalId))
        .where(and(eq(treatments.farmId, farmId), eq(treatments.seasonId, season.id)))
        .orderBy(desc(treatments.createdAt)),
      deps.db
        .select({ id: weights.id, at: weights.createdAt, animalTag: animals.tagNumber, weightKg: weights.weightKg })
        .from(weights)
        .leftJoin(animals, eq(animals.id, weights.animalId))
        .where(and(eq(weights.farmId, farmId), eq(weights.seasonId, season.id)))
        .orderBy(desc(weights.createdAt)),
    ]);

    return {
      season: { id: season.id, name: season.name },
      camps: campsRollup,
      unplaced,
      treatments: treatmentRows.map((row) => ({ ...row, at: row.at.toISOString() })),
      weights: weightRows.map((row) => ({ ...row, at: row.at.toISOString() })),
    };
  });
}
