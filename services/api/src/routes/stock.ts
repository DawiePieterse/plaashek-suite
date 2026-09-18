import { stockItems, stockMoves } from "@plaashek/schema";
import { and, asc, eq } from "drizzle-orm";
import type { App, AppDeps } from "../app.js";
import { requireStaff } from "../auth/require-staff.js";
import { logAudit } from "../lib/audit.js";
import { requireDeviceTicket } from "../lib/device-ticket.js";
import { assertFarmOwns } from "../lib/farm.js";
import { createStockItemRequestSchema, updateStockItemRequestSchema } from "../schemas/stock.js";

/**
 * Stoor (plan §11, docs/stoor-build-scope.md): the catalog, the phone's
 * offline-safe copy of it, and what is on the shelf. `/export/stock.csv`
 * lives with the other exports in `export.ts`, same as every other module.
 */
export function registerStockRoutes(app: App, deps: AppDeps) {
  /** The catalog, whatever it has moved or not — an item does not vanish once it has history. */
  app.get("/stock-items", { preHandler: requireStaff(deps.env.staffSessionSecret, ["admin", "owner"]) }, async (request) => {
    const farmId = request.staff!.farmId;

    const items = await deps.db
      .select({ id: stockItems.id, name: stockItems.name, unit: stockItems.unit, active: stockItems.active })
      .from(stockItems)
      .where(eq(stockItems.farmId, farmId))
      .orderBy(asc(stockItems.name));

    return { items };
  });

  app.post("/stock-items", { preHandler: requireStaff(deps.env.staffSessionSecret, ["admin"]) }, async (request) => {
    const staff = request.staff!;
    const body = createStockItemRequestSchema.parse(request.body);

    return deps.db.transaction(async (tx) => {
      const [item] = await tx.insert(stockItems).values({ farmId: staff.farmId, name: body.name, unit: body.unit }).returning();
      await logAudit(tx, { actor: staff.farmMembershipId, action: "create_stock_item", target: item.id, farmId: staff.farmId });
      return { item };
    });
  });

  /**
   * Rename, fix the unit, or retire an item. Nothing here touches moves
   * already captured — they keep their attribution, same as a renumbered
   * piece-work worker keeps their crates (ADR 0011's precedent).
   */
  app.patch("/stock-items/:itemId", { preHandler: requireStaff(deps.env.staffSessionSecret, ["admin"]) }, async (request) => {
    const staff = request.staff!;
    const { itemId } = request.params as { itemId: string };
    const body = updateStockItemRequestSchema.parse(request.body);

    await assertFarmOwns(deps.db, stockItems, stockItems.id, stockItems.farmId, itemId, staff.farmId);

    return deps.db.transaction(async (tx) => {
      const [item] = await tx
        .update(stockItems)
        .set({
          ...(body.name === undefined ? {} : { name: body.name }),
          ...(body.unit === undefined ? {} : { unit: body.unit }),
          ...(body.active === undefined ? {} : { active: body.active }),
        })
        .where(eq(stockItems.id, itemId))
        .returning();

      await logAudit(tx, { actor: staff.farmMembershipId, action: "edit_stock_item", target: itemId, farmId: staff.farmId });

      return { item };
    });
  });

  /**
   * The phone's cached picker (docs/stoor-build-scope.md) — active items
   * only, the same role `/blocks` and `/pickers` play for their screens.
   */
  app.get("/stock-catalog", async (request) => {
    const claims = await requireDeviceTicket(request.headers, deps);

    const items = await deps.db
      .select({ id: stockItems.id, name: stockItems.name, unit: stockItems.unit })
      .from(stockItems)
      .where(and(eq(stockItems.farmId, claims.farmId), eq(stockItems.active, true)))
      .orderBy(asc(stockItems.name));

    return { items };
  });

  /**
   * What is on the shelf. Unlike Harvest and Span this is a running total,
   * not scoped to the active season (docs/stoor-build-scope.md) — a shed
   * does not empty itself at a season boundary. Derived at read time from
   * every move ever captured, nothing totalled is stored.
   */
  app.get("/eienaar/stock", { preHandler: requireStaff(deps.env.staffSessionSecret, ["admin", "owner"]) }, async (request) => {
    const farmId = request.staff!.farmId;

    const [items, moves] = await Promise.all([
      deps.db
        .select({ id: stockItems.id, name: stockItems.name, unit: stockItems.unit, active: stockItems.active })
        .from(stockItems)
        .where(eq(stockItems.farmId, farmId))
        .orderBy(asc(stockItems.name)),
      deps.db
        .select({ itemId: stockMoves.itemId, direction: stockMoves.direction, quantity: stockMoves.quantity })
        .from(stockMoves)
        .where(eq(stockMoves.farmId, farmId)),
    ]);

    const onHand = new Map<string, number>();
    for (const move of moves) {
      const signed = move.direction === "out" ? -move.quantity : move.quantity;
      onHand.set(move.itemId, (onHand.get(move.itemId) ?? 0) + signed);
    }

    return {
      items: items.map((item) => ({
        itemId: item.id,
        name: item.name,
        unit: item.unit,
        active: item.active,
        onHand: Math.round((onHand.get(item.id) ?? 0) * 100) / 100,
      })),
    };
  });
}
