import type { App, AppDeps } from "../app.js";
import { requireDeviceTicket } from "../lib/device-ticket.js";
import { listFarmAssets } from "../lib/farm.js";

/** Picker data for Water's meter field and Werkswinkel's equipment field (ADR 0014) — same shape as `GET /blocks`. */
export function registerAssetRoutes(app: App, deps: AppDeps) {
  app.get("/assets", async (request) => {
    const claims = await requireDeviceTicket(request.headers, deps);

    return { assets: await listFarmAssets(deps.db, claims.farmId) };
  });
}
