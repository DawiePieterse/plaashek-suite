import { farms, people } from "@plaashek/schema";
import { eq } from "drizzle-orm";
import type { App, AppDeps } from "../app.js";
import { requireStaff } from "../auth/require-staff.js";
import { activeModuleCodes } from "../lib/entitlements.js";
import { notFound } from "../lib/errors.js";

/** Everything the Farm Admin Tool needs to draw its pickers: farm name, stamp names, licensed modules. */
export function registerFarmRoutes(app: App, deps: AppDeps) {
  app.get("/farm", { preHandler: requireStaff(deps.env.staffSessionSecret, ["admin", "owner"]) }, async (request) => {
    const farmId = request.staff!.farmId;

    const [[farm], farmPeople, modules] = await Promise.all([
      deps.db.select({ id: farms.id, name: farms.name }).from(farms).where(eq(farms.id, farmId)),
      deps.db.select({ id: people.id, name: people.name }).from(people).where(eq(people.farmId, farmId)),
      activeModuleCodes(deps.db, farmId),
    ]);
    if (!farm) throw notFound();

    return { farm, people: farmPeople, modules };
  });
}
