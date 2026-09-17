import { camps, farms, heldWrites, notes, people } from "@plaashek/schema";
import { and, asc, count, eq, isNull } from "drizzle-orm";
import type { App, AppDeps } from "../app.js";
import { requireStaff } from "../auth/require-staff.js";
import { activeModuleCodes } from "../lib/entitlements.js";
import { notFound } from "../lib/errors.js";
import { listFarmBlocks } from "../lib/farm.js";

/** Everything the Farm Admin Tool needs to draw its pickers: farm name, stamp names, blocks/camps, licensed modules. */
export function registerFarmRoutes(app: App, deps: AppDeps) {
  app.get("/farm", { preHandler: requireStaff(deps.env.staffSessionSecret, ["admin", "owner"]) }, async (request) => {
    const farmId = request.staff!.farmId;

    const [[farm], farmPeople, farmBlocks, farmCamps, modules, [held], [withoutSeason]] = await Promise.all([
      deps.db.select({ id: farms.id, name: farms.name }).from(farms).where(eq(farms.id, farmId)),
      deps.db.select({ id: people.id, name: people.name }).from(people).where(eq(people.farmId, farmId)).orderBy(asc(people.name)),
      listFarmBlocks(deps.db, farmId),
      deps.db
        .select({ id: camps.id, name: camps.name, blockId: camps.blockId })
        .from(camps)
        .where(eq(camps.farmId, farmId))
        .orderBy(asc(camps.name)),
      activeModuleCodes(deps.db, farmId),
      // What the office has to act on: captures waiting behind a lapsed licence
      // (plan §5) and captures the phone could not stamp with a season (§6).
      deps.db
        .select({ n: count() })
        .from(heldWrites)
        .where(and(eq(heldWrites.farmId, farmId), isNull(heldWrites.releasedAt))),
      deps.db
        .select({ n: count() })
        .from(notes)
        .where(and(eq(notes.farmId, farmId), isNull(notes.seasonId))),
    ]);
    if (!farm) throw notFound();

    return {
      farm,
      people: farmPeople,
      blocks: farmBlocks,
      camps: farmCamps,
      modules,
      waiting: { held: held.n, withoutSeason: withoutSeason.n },
    };
  });
}
