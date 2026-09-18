import { assets, workOrders } from "@plaashek/schema";
import { asc, eq } from "drizzle-orm";
import type { App, AppDeps } from "../app.js";
import { requireStaff } from "../auth/require-staff.js";
import { requireDeviceTicket } from "../lib/device-ticket.js";
import { openWorkOrders, type WorkOrderEvent } from "../lib/werkswinkel.js";

async function farmWorkOrderEvents(deps: AppDeps, farmId: string): Promise<WorkOrderEvent[]> {
  const rows = await deps.db
    .select({ assetId: workOrders.assetId, assetName: assets.name, event: workOrders.event, description: workOrders.description, at: workOrders.createdAt })
    .from(workOrders)
    .innerJoin(assets, eq(assets.id, workOrders.assetId))
    .where(eq(workOrders.farmId, farmId));

  return rows.map((row) => ({ ...row, event: row.event as "opened" | "closed" }));
}

/**
 * Werkswinkel (plan §11, docs/werkswinkel-build-scope.md): the phone's asset
 * picker, what is still open on each asset, and the office's own view of
 * the same. `/export/work-orders.csv` and `/export/fuel.csv` live with the
 * other exports in `export.ts`.
 */
export function registerWerkswinkelRoutes(app: App, deps: AppDeps) {
  /**
   * The phone's cached asset list (docs/werkswinkel-build-scope.md) — the
   * same role `/blocks`, `/pickers` and the two other `*-catalog` routes
   * play. Not renamed to `/assets-catalog`: `POST /assets` is staff-only,
   * so the method already tells the two apart.
   */
  app.get("/assets", async (request) => {
    const claims = await requireDeviceTicket(request.headers, deps);

    const farmAssets = await deps.db.select({ id: assets.id, name: assets.name }).from(assets).where(eq(assets.farmId, claims.farmId)).orderBy(asc(assets.name));

    return { assets: farmAssets };
  });

  /**
   * What is still open, across every asset — the phone's own read, so a
   * different device can close a job than the one that opened it (no
   * in-app person picker still holds; any paired phone can act on any
   * asset's job).
   */
  app.get("/work-orders/open", async (request) => {
    const claims = await requireDeviceTicket(request.headers, deps);
    const jobs = openWorkOrders(await farmWorkOrderEvents(deps, claims.farmId));

    return { jobs };
  });

  /** The office's own view of the same list, staff-gated. */
  app.get("/eienaar/werkswinkel", { preHandler: requireStaff(deps.env.staffSessionSecret, ["admin", "owner"]) }, async (request) => {
    const farmId = request.staff!.farmId;
    const jobs = openWorkOrders(await farmWorkOrderEvents(deps, farmId));

    const byAsset = new Map<string, { assetId: string; assetName: string; jobs: { description: string | null; openedAt: string }[] }>();
    for (const job of jobs) {
      const entry = byAsset.get(job.assetId) ?? { assetId: job.assetId, assetName: job.assetName, jobs: [] };
      entry.jobs.push({ description: job.description, openedAt: job.openedAt.toISOString() });
      byAsset.set(job.assetId, entry);
    }

    return { assets: [...byAsset.values()].sort((a, b) => a.assetName.localeCompare(b.assetName)) };
  });
}
