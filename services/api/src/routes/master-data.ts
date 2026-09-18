import { assets, blocks, camps, people } from "@plaashek/schema";
import type { PgTable } from "drizzle-orm/pg-core";
import type { App, AppDeps } from "../app.js";
import { requireStaff } from "../auth/require-staff.js";
import type { Db } from "../db.js";
import { logAudit } from "../lib/audit.js";
import { assertFarmOwns } from "../lib/farm.js";
import { createAssetRequestSchema, createBlockRequestSchema, createCampRequestSchema, createPersonRequestSchema } from "../schemas/master-data.js";

/** Insert one farm-scoped master-data row and audit-log it, inside its own transaction — the shape every route below shares. */
function createFarmRow<Table extends PgTable>(
  db: Pick<Db, "transaction">,
  table: Table,
  values: Table["$inferInsert"],
  entry: { actor: string; action: string; farmId: string },
): Promise<Table["$inferSelect"]> {
  return db.transaction(async (tx) => {
    const [row] = await tx.insert(table).values(values).returning();
    await logAudit(tx, { ...entry, target: (row as Table["$inferSelect"]).id as string });
    return row as Table["$inferSelect"];
  });
}

/**
 * Create-only endpoints for the farm's own people, blocks and camps — `GET
 * /farm` already lists them for the Farm Admin Tool's pickers. Add-only:
 * nothing downstream asks to rename or remove one yet (plan §12 Phase 4).
 */
export function registerMasterDataRoutes(app: App, deps: AppDeps) {
  app.post("/people", { preHandler: requireStaff(deps.env.staffSessionSecret, ["admin", "owner"]) }, async (request) => {
    const staff = request.staff!;
    const body = createPersonRequestSchema.parse(request.body);

    const person = await createFarmRow(
      deps.db,
      people,
      { farmId: staff.farmId, name: body.name },
      { actor: staff.farmMembershipId, action: "create_person", farmId: staff.farmId },
    );

    return { person };
  });

  app.post("/blocks", { preHandler: requireStaff(deps.env.staffSessionSecret, ["admin", "owner"]) }, async (request) => {
    const staff = request.staff!;
    const body = createBlockRequestSchema.parse(request.body);

    const block = await createFarmRow(
      deps.db,
      blocks,
      { farmId: staff.farmId, name: body.name },
      { actor: staff.farmMembershipId, action: "create_block", farmId: staff.farmId },
    );

    return { block };
  });

  app.post("/camps", { preHandler: requireStaff(deps.env.staffSessionSecret, ["admin", "owner"]) }, async (request) => {
    const staff = request.staff!;
    const body = createCampRequestSchema.parse(request.body);

    if (body.blockId) {
      await assertFarmOwns(deps.db, blocks, blocks.id, blocks.farmId, body.blockId, staff.farmId);
    }

    const camp = await createFarmRow(
      deps.db,
      camps,
      { farmId: staff.farmId, name: body.name, blockId: body.blockId ?? null },
      { actor: staff.farmMembershipId, action: "create_camp", farmId: staff.farmId },
    );

    return { camp };
  });

  /** Closes the gap Werkswinkel found (docs/werkswinkel-build-scope.md): a table existed, nothing could add to it. */
  app.post("/assets", { preHandler: requireStaff(deps.env.staffSessionSecret, ["admin", "owner"]) }, async (request) => {
    const staff = request.staff!;
    const body = createAssetRequestSchema.parse(request.body);

    const asset = await createFarmRow(
      deps.db,
      assets,
      { farmId: staff.farmId, name: body.name },
      { actor: staff.farmMembershipId, action: "create_asset", farmId: staff.farmId },
    );

    return { asset };
  });
}
