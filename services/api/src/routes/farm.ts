import { blocks, camps, farms, heldWrites, people, seasonStampedTables } from "@plaashek/schema";
import { and, asc, count, eq, isNull } from "drizzle-orm";
import type { App, AppDeps } from "../app.js";
import { requireStaff } from "../auth/require-staff.js";
import { activeModuleCodes } from "../lib/entitlements.js";
import { notFound } from "../lib/errors.js";

/** Everything the Farm Admin Tool needs to draw its pickers: farm name, stamp names, blocks/camps, licensed modules. */
export function registerFarmRoutes(app: App, deps: AppDeps) {
  app.get("/farm", { preHandler: requireStaff(deps.env.staffSessionSecret, ["admin", "owner"]) }, async (request) => {
    const farmId = request.staff!.farmId;

    const [[farm], farmPeople, farmBlocks, farmCamps, modules, [held], withoutSeason] = await Promise.all([
      deps.db.select({ id: farms.id, name: farms.name }).from(farms).where(eq(farms.id, farmId)),
      // Staff only: a seasonal picker carries a printed card, never a phone
      // (ADR 0009), so forty of them have no business in the device-assignment
      // list. The piece-work register is where they live.
      deps.db
        .select({ id: people.id, name: people.name })
        .from(people)
        .where(and(eq(people.farmId, farmId), eq(people.kind, "staff")))
        .orderBy(asc(people.name)),
      deps.db.select({ id: blocks.id, name: blocks.name }).from(blocks).where(eq(blocks.farmId, farmId)).orderBy(asc(blocks.name)),
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
      // Every season-stamped module, not just veldnotas: a capture the phone
      // could not stamp is the office's to place whichever module it came from.
      Promise.all(
        seasonStampedTables.map((table) =>
          deps.db
            .select({ n: count() })
            .from(table)
            .where(and(eq(table.farmId, farmId), isNull(table.seasonId))),
        ),
      ),
    ]);
    if (!farm) throw notFound();

    const unstamped = withoutSeason.reduce((total, [row]) => total + row.n, 0);

    return {
      farm,
      people: farmPeople,
      blocks: farmBlocks,
      camps: farmCamps,
      modules,
      waiting: { held: held.n, withoutSeason: unstamped },
    };
  });
}
