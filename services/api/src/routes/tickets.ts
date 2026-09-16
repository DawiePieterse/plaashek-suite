import { deviceModules } from "@plaashek/schema";
import { mintTicket, verifyTicket } from "@plaashek/tickets";
import { eq } from "drizzle-orm";
import type { App, AppDeps } from "../app.js";
import { activeModuleCodes } from "../lib/entitlements.js";
import { unauthorized } from "../lib/errors.js";
import { activeSeasonId, farmLanguage } from "../lib/farm.js";
import { bearerToken } from "../lib/http.js";

export function registerTicketRoutes(app: App, deps: AppDeps) {
  app.post("/tickets/refresh", async (request) => {
    const token = bearerToken(request.headers.authorization);
    if (!token) throw unauthorized("unauthenticated", "Missing device ticket");

    let claims: Awaited<ReturnType<typeof verifyTicket>>;
    try {
      claims = await verifyTicket(token, deps.keys.publicKey);
    } catch (error) {
      const code = (error as { code?: string }).code;
      if (code === "ERR_JWT_EXPIRED") throw unauthorized("ticket_expired", "Device ticket has expired");
      throw unauthorized("ticket_invalid", "Device ticket is invalid");
    }

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
