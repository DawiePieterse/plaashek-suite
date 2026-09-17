import { blocks } from "@plaashek/schema";
import { asc, eq } from "drizzle-orm";
import type { App, AppDeps } from "../app.js";
import { requireDeviceTicket } from "../lib/device-ticket.js";

/** Picker data for Boord's block field (docs/boord-reuse-audit.md) — not part of the signed ticket, just a list to render. */
export function registerBlockRoutes(app: App, deps: AppDeps) {
  app.get("/blocks", async (request) => {
    const claims = await requireDeviceTicket(request.headers, deps);

    const farmBlocks = await deps.db
      .select({ id: blocks.id, name: blocks.name })
      .from(blocks)
      .where(eq(blocks.farmId, claims.farmId))
      .orderBy(asc(blocks.name));

    return { blocks: farmBlocks };
  });
}
