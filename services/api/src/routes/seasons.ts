import { seasons } from "@plaashek/schema";
import { and, eq, ne } from "drizzle-orm";
import type { App, AppDeps } from "../app.js";
import { requireStaff } from "../auth/require-staff.js";
import type { Db } from "../db.js";
import { logAudit } from "../lib/audit.js";
import { notFound } from "../lib/errors.js";
import { createSeasonRequestSchema, updateSeasonRequestSchema } from "../schemas/seasons.js";

/**
 * One active season per farm is a partial unique index in the schema, so the
 * old one has to stand down inside the same transaction as the new one standing
 * up — otherwise Postgres rejects the write rather than the app choosing a winner.
 */
async function standDownOthers(tx: Pick<Db, "update">, farmId: string, exceptId: string) {
  await tx
    .update(seasons)
    .set({ isActive: false })
    .where(and(eq(seasons.farmId, farmId), eq(seasons.isActive, true), ne(seasons.id, exceptId)));
}

export function registerSeasonRoutes(app: App, deps: AppDeps) {
  app.get("/seasons", { preHandler: requireStaff(deps.env.staffSessionSecret, ["admin", "owner"]) }, async (request) => {
    const farmSeasons = await deps.db
      .select()
      .from(seasons)
      .where(eq(seasons.farmId, request.staff!.farmId))
      .orderBy(seasons.startsOn);

    return { seasons: farmSeasons };
  });

  app.post("/seasons", { preHandler: requireStaff(deps.env.staffSessionSecret, ["admin", "owner"]) }, async (request) => {
    const staff = request.staff!;
    const body = createSeasonRequestSchema.parse(request.body);

    return deps.db.transaction(async (tx) => {
      const [season] = await tx
        .insert(seasons)
        .values({ ...body, farmId: staff.farmId, isActive: false })
        .returning();

      if (body.isActive) {
        await standDownOthers(tx, staff.farmId, season.id);
        await tx.update(seasons).set({ isActive: true }).where(eq(seasons.id, season.id));
        season.isActive = true;
      }

      await logAudit(tx, { actor: staff.farmMembershipId, action: "create_season", target: season.id, farmId: staff.farmId });

      return { season };
    });
  });

  app.patch("/seasons/:id", { preHandler: requireStaff(deps.env.staffSessionSecret, ["admin", "owner"]) }, async (request) => {
    const staff = request.staff!;
    const { id } = request.params as { id: string };
    const body = updateSeasonRequestSchema.parse(request.body);

    return deps.db.transaction(async (tx) => {
      const [existing] = await tx.select().from(seasons).where(and(eq(seasons.id, id), eq(seasons.farmId, staff.farmId)));
      if (!existing) throw notFound();

      if (body.isActive) await standDownOthers(tx, staff.farmId, id);

      const [season] = await tx.update(seasons).set(body).where(eq(seasons.id, id)).returning();

      await logAudit(tx, { actor: staff.farmMembershipId, action: "update_season", target: id, farmId: staff.farmId });

      return { season };
    });
  });
}
