import { animals } from "@plaashek/schema";
import { and, asc, eq } from "drizzle-orm";
import type { App, AppDeps } from "../app.js";
import { requireDeviceTicket } from "../lib/device-ticket.js";

/**
 * Kudde (plan §11, docs/kudde-build-scope.md). Just the phone's offline-safe
 * picker for now — the register (`POST`/`PATCH /animals`) and the office
 * rollup are a later build-scope step.
 */
export function registerKuddeRoutes(app: App, deps: AppDeps) {
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
}
