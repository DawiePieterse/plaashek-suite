import { blocks, people, productRegistrations, seasons, sprayApplications, stockItems, waterPoints } from "@plaashek/schema";
import { and, asc, desc, eq } from "drizzle-orm";
import type { App, AppDeps } from "../app.js";
import { requireStaff } from "../auth/require-staff.js";
import { logAudit } from "../lib/audit.js";
import { requireDeviceTicket } from "../lib/device-ticket.js";
import { assertFarmOwns } from "../lib/farm.js";
import { createProductRegistrationRequestSchema, updateProductRegistrationRequestSchema } from "../schemas/bespuiting.js";

/**
 * A withholding period is free text (docs/bespuiting-build-scope.md) — real
 * values include "1 dag", "28 dae", "Geen", "Geen — nie op vrugte nie" — so
 * a safe-harvest date can only ever be a best-effort read of it: the first
 * number of days found, added to the application date. Text with no number
 * ("Geen", "Not on fruit") computes nothing; the office still sees the raw
 * withholding period either way. Never stored — computed fresh on every
 * read, same as Stoor's on-hand total and Water's delta.
 */
export function safeHarvestDate(appliedAt: Date, withholdingPeriod: string | null): string | null {
  if (!withholdingPeriod) return null;
  const match = /(\d+)/.exec(withholdingPeriod);
  if (!match) return null;

  const days = Number(match[1]);
  const date = new Date(appliedAt);
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}

/**
 * Bespuiting (docs/bespuiting-build-scope.md): the compliance layer over
 * Stoor and Water — which product went on which block, plus the active
 * ingredient, withholding period and computed safe-harvest date the general
 * stock ledger deliberately does not carry. `/export/bespuiting.csv` lives
 * with the other exports in `export.ts`.
 */
export function registerBespuitingRoutes(app: App, deps: AppDeps) {
  /** Every registration this farm has entered — not every stock item has one (docs/bespuiting-build-scope.md). */
  app.get("/product-registrations", { preHandler: requireStaff(deps.env.staffSessionSecret, ["admin", "owner"]) }, async (request) => {
    const farmId = request.staff!.farmId;

    const registrations = await deps.db
      .select({
        id: productRegistrations.id,
        itemId: productRegistrations.itemId,
        itemName: stockItems.name,
        activeIngredient: productRegistrations.activeIngredient,
        defaultReason: productRegistrations.defaultReason,
        lNumber: productRegistrations.lNumber,
        withholdingPeriod: productRegistrations.withholdingPeriod,
      })
      .from(productRegistrations)
      .innerJoin(stockItems, eq(stockItems.id, productRegistrations.itemId))
      .where(eq(productRegistrations.farmId, farmId))
      .orderBy(asc(stockItems.name));

    return { registrations };
  });

  app.post("/product-registrations", { preHandler: requireStaff(deps.env.staffSessionSecret, ["admin"]) }, async (request) => {
    const staff = request.staff!;
    const body = createProductRegistrationRequestSchema.parse(request.body);

    await assertFarmOwns(deps.db, stockItems, stockItems.id, stockItems.farmId, body.item_id, staff.farmId);

    return deps.db.transaction(async (tx) => {
      const [registration] = await tx
        .insert(productRegistrations)
        .values({
          farmId: staff.farmId,
          itemId: body.item_id,
          activeIngredient: body.active_ingredient,
          defaultReason: body.default_reason ?? null,
          lNumber: body.l_number ?? null,
          withholdingPeriod: body.withholding_period ?? null,
        })
        .returning();
      await logAudit(tx, { actor: staff.farmMembershipId, action: "create_product_registration", target: registration.id, farmId: staff.farmId });
      return { registration };
    });
  });

  /** Fix the active ingredient, the L-number, or the withholding period. Nothing here touches applications already captured. */
  app.patch("/product-registrations/:registrationId", { preHandler: requireStaff(deps.env.staffSessionSecret, ["admin"]) }, async (request) => {
    const staff = request.staff!;
    const { registrationId } = request.params as { registrationId: string };
    const body = updateProductRegistrationRequestSchema.parse(request.body);

    await assertFarmOwns(deps.db, productRegistrations, productRegistrations.id, productRegistrations.farmId, registrationId, staff.farmId);

    return deps.db.transaction(async (tx) => {
      const [registration] = await tx
        .update(productRegistrations)
        .set({
          ...(body.active_ingredient === undefined ? {} : { activeIngredient: body.active_ingredient }),
          ...(body.default_reason === undefined ? {} : { defaultReason: body.default_reason }),
          ...(body.l_number === undefined ? {} : { lNumber: body.l_number }),
          ...(body.withholding_period === undefined ? {} : { withholdingPeriod: body.withholding_period }),
        })
        .where(eq(productRegistrations.id, registrationId))
        .returning();

      await logAudit(tx, { actor: staff.farmMembershipId, action: "edit_product_registration", target: registrationId, farmId: staff.farmId });

      return { registration };
    });
  });

  /**
   * The phone's cached copy (docs/bespuiting-build-scope.md) — keyed by item,
   * so the field screen can prefill a reason and show a withholding-period
   * hint the moment a product is picked, offline. Only items with a
   * registration appear; a product with none simply gets no hint.
   */
  app.get("/spray-catalog", async (request) => {
    const claims = await requireDeviceTicket(request.headers, deps);

    const registrations = await deps.db
      .select({
        itemId: productRegistrations.itemId,
        activeIngredient: productRegistrations.activeIngredient,
        defaultReason: productRegistrations.defaultReason,
        withholdingPeriod: productRegistrations.withholdingPeriod,
      })
      .from(productRegistrations)
      .where(eq(productRegistrations.farmId, claims.farmId));

    return { registrations };
  });

  /**
   * Applications in range, newest first, with the safe-harvest date computed
   * at read time — never stored, same rule as every other rollup in this
   * suite. This does not repeat what `/eienaar/stock` and `/eienaar/water`
   * already show: it is the compliance record, not another on-hand total.
   */
  app.get("/eienaar/bespuiting", { preHandler: requireStaff(deps.env.staffSessionSecret, ["admin", "owner"]) }, async (request) => {
    const farmId = request.staff!.farmId;

    const rows = await deps.db
      .select({
        id: sprayApplications.id,
        createdAt: sprayApplications.createdAt,
        person: people.name,
        block: blocks.name,
        item: stockItems.name,
        unit: stockItems.unit,
        quantity: sprayApplications.quantity,
        concentration: sprayApplications.concentration,
        reason: sprayApplications.reason,
        method: sprayApplications.method,
        waterPoint: waterPoints.name,
        meterReading: sprayApplications.meterReading,
        season: seasons.name,
        withholdingPeriod: productRegistrations.withholdingPeriod,
      })
      .from(sprayApplications)
      .leftJoin(people, eq(people.id, sprayApplications.createdBy))
      .leftJoin(blocks, eq(blocks.id, sprayApplications.blockId))
      .leftJoin(stockItems, eq(stockItems.id, sprayApplications.itemId))
      .leftJoin(waterPoints, eq(waterPoints.id, sprayApplications.waterPointId))
      .leftJoin(seasons, eq(seasons.id, sprayApplications.seasonId))
      .leftJoin(productRegistrations, eq(productRegistrations.itemId, sprayApplications.itemId))
      .where(eq(sprayApplications.farmId, farmId))
      .orderBy(desc(sprayApplications.createdAt));

    return {
      applications: rows.map((row) => ({
        applicationId: row.id,
        at: row.createdAt.toISOString(),
        person: row.person,
        block: row.block,
        item: row.item,
        unit: row.unit,
        quantity: row.quantity,
        concentration: row.concentration,
        reason: row.reason,
        method: row.method,
        waterPoint: row.waterPoint,
        meterReading: row.meterReading,
        season: row.season,
        withholdingPeriod: row.withholdingPeriod,
        safeHarvestDate: safeHarvestDate(row.createdAt, row.withholdingPeriod),
      })),
    };
  });
}
