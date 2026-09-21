import type { App, AppDeps } from "../app.js";
import { requireDeviceTicket } from "../lib/device-ticket.js";
import { listFarmBlocks, listFarmCamps } from "../lib/farm.js";

/** Picker data for Boord's block field (docs/boord-reuse-audit.md) — not part of the signed ticket, just a list to render. */
export function registerBlockRoutes(app: App, deps: AppDeps) {
  app.get("/blocks", async (request) => {
    const claims = await requireDeviceTicket(request.headers, deps);

    return { blocks: await listFarmBlocks(deps.db, claims.farmId) };
  });
}

/** Picker data for Kudde's move destination (docs/kudde-build-scope.md) — same role `/blocks` plays, one farm's camps, device-ticket-gated. */
export function registerCampRoutes(app: App, deps: AppDeps) {
  app.get("/camps", async (request) => {
    const claims = await requireDeviceTicket(request.headers, deps);

    return { camps: await listFarmCamps(deps.db, claims.farmId) };
  });
}
