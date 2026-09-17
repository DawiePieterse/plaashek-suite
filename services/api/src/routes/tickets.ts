import { deviceModules } from "@plaashek/schema";
import { mintTicket } from "@plaashek/tickets";
import { eq } from "drizzle-orm";
import type { App, AppDeps } from "../app.js";
import { requireDeviceTicket } from "../lib/device-ticket.js";
import { activeModuleCodes } from "../lib/entitlements.js";
import { activeSeasonId, farmLanguage } from "../lib/farm.js";

export function registerTicketRoutes(app: App, deps: AppDeps) {
  app.post("/tickets/refresh", async (request) => {
    const claims = await requireDeviceTicket(request.headers, deps);

    const ceiling = await activeModuleCodes(deps.db, claims.farmId);
    const floorRows = await deps.db.select({ moduleCode: deviceModules.moduleCode }).from(deviceModules).where(eq(deviceModules.deviceId, claims.deviceId));
    const floor = floorRows.map((r) => r.moduleCode);

    const ticket = await mintTicket({
      farmId: claims.farmId,
      deviceId: claims.deviceId,
      farmModules: ceiling,
      deviceModules: floor,
      // Re-read every refresh, so a farm that switches language reaches the phones already paired.
      language: await farmLanguage(deps.db, claims.farmId),
      seasonId: await activeSeasonId(deps.db, claims.farmId),
      signingKey: deps.keys.privateKey,
    });

    return { ticket };
  });
}
