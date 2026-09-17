import { blocks, camps, people } from "@plaashek/schema";
import { and, eq } from "drizzle-orm";
import type { App, AppDeps } from "../app.js";
import { requireStaff } from "../auth/require-staff.js";
import { logAudit } from "../lib/audit.js";
import { notFound } from "../lib/errors.js";
import { createBlockRequestSchema, createCampRequestSchema, createPersonRequestSchema } from "../schemas/master-data.js";

/**
 * Create-only endpoints for the farm's own people, blocks and camps — `GET
 * /farm` already lists them for the Farm Admin Tool's pickers. Add-only:
 * nothing downstream asks to rename or remove one yet (plan §12 Phase 4).
 */
export function registerMasterDataRoutes(app: App, deps: AppDeps) {
  app.post("/people", { preHandler: requireStaff(deps.env.staffSessionSecret, ["admin"]) }, async (request) => {
    const staff = request.staff!;
    const body = createPersonRequestSchema.parse(request.body);

    return deps.db.transaction(async (tx) => {
      const [person] = await tx.insert(people).values({ farmId: staff.farmId, name: body.name }).returning();

      await logAudit(tx, { actor: staff.farmMembershipId, action: "create_person", target: person.id, farmId: staff.farmId });

      return { person };
    });
  });

  app.post("/blocks", { preHandler: requireStaff(deps.env.staffSessionSecret, ["admin"]) }, async (request) => {
    const staff = request.staff!;
    const body = createBlockRequestSchema.parse(request.body);

    return deps.db.transaction(async (tx) => {
      const [block] = await tx.insert(blocks).values({ farmId: staff.farmId, name: body.name }).returning();

      await logAudit(tx, { actor: staff.farmMembershipId, action: "create_block", target: block.id, farmId: staff.farmId });

      return { block };
    });
  });

  app.post("/camps", { preHandler: requireStaff(deps.env.staffSessionSecret, ["admin"]) }, async (request) => {
    const staff = request.staff!;
    const body = createCampRequestSchema.parse(request.body);

    // The block FK only proves the block exists, not that it's this farm's
    // — same reasoning as the device/person check in devices.ts (plan §6:
    // no cross-farm foreign keys).
    if (body.blockId) {
      const [block] = await deps.db.select({ id: blocks.id }).from(blocks).where(and(eq(blocks.id, body.blockId), eq(blocks.farmId, staff.farmId)));
      if (!block) throw notFound();
    }

    return deps.db.transaction(async (tx) => {
      const [camp] = await tx.insert(camps).values({ farmId: staff.farmId, name: body.name, blockId: body.blockId ?? null }).returning();

      await logAudit(tx, { actor: staff.farmMembershipId, action: "create_camp", target: camp.id, farmId: staff.farmId });

      return { camp };
    });
  });
}
