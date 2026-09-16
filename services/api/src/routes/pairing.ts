import { deviceModules, devices, pairingTokens } from "@plaashek/schema";
import { mintTicket } from "@plaashek/tickets";
import { and, eq } from "drizzle-orm";
import type { App, AppDeps } from "../app.js";
import { requireStaff } from "../auth/require-staff.js";
import type { Db } from "../db.js";
import { logAudit } from "../lib/audit.js";
import { activeModuleCodes } from "../lib/entitlements.js";
import { conflict, forbidden, gone, notFound } from "../lib/errors.js";
import { pairingTokenState, type PairingTokenRow } from "../lib/pairing-state.js";
import { pairingExpiry, qrUrl, randomPairingToken } from "../lib/pairing-token.js";

/** Locks the row — callers mutate it, so the pending check must not race a concurrent scan or reprint. */
async function lockFarmPairingToken(db: Pick<Db, "select">, id: string, farmId: string): Promise<PairingTokenRow> {
  const [row] = await db
    .select({ pairingToken: pairingTokens })
    .from(pairingTokens)
    .innerJoin(devices, eq(devices.id, pairingTokens.deviceId))
    .where(and(eq(pairingTokens.id, id), eq(devices.farmId, farmId)))
    .for("update");
  if (!row) throw notFound();
  return row.pairingToken;
}

/** Throws the right 409/410 for a non-pending state; no-op if pending. */
function requirePending(row: PairingTokenRow, now: Date) {
  const state = pairingTokenState(row, now);
  if (state === "used") throw conflict("token_used", "This pairing token has already been scanned");
  if (state === "cancelled") throw gone("token_cancelled", "This pairing token was cancelled");
  if (state === "expired") throw gone("token_expired", "This pairing token has expired");
}

export function registerPairingRoutes(app: App, deps: AppDeps) {
  app.post(
    "/pairing-tokens/:id/reprint",
    { preHandler: requireStaff(deps.env.staffSessionSecret, ["admin"]) },
    async (request) => {
      const staff = request.staff!;
      const { id } = request.params as { id: string };
      const now = new Date();

      return deps.db.transaction(async (tx) => {
        const pairingToken = await lockFarmPairingToken(tx, id, staff.farmId);
        requirePending(pairingToken, now);

        await tx.update(pairingTokens).set({ cancelledAt: now }).where(eq(pairingTokens.id, id));

        const [fresh] = await tx
          .insert(pairingTokens)
          .values({
            deviceId: pairingToken.deviceId,
            moduleCode: pairingToken.moduleCode,
            token: randomPairingToken(),
            printedBy: staff.farmMembershipId,
            expiresAt: pairingExpiry(now),
          })
          .returning();

        await logAudit(tx, { actor: staff.farmMembershipId, action: "reprint_pairing_token", target: fresh.id, farmId: staff.farmId });

        return { pairingToken: { ...fresh, qrUrl: qrUrl(fresh.token) } };
      });
    },
  );

  app.post(
    "/pairing-tokens/:id/cancel",
    { preHandler: requireStaff(deps.env.staffSessionSecret, ["admin"]) },
    async (request) => {
      const staff = request.staff!;
      const { id } = request.params as { id: string };
      const now = new Date();

      return deps.db.transaction(async (tx) => {
        const pairingToken = await lockFarmPairingToken(tx, id, staff.farmId);
        requirePending(pairingToken, now);

        const [cancelled] = await tx
          .update(pairingTokens)
          .set({ cancelledAt: now })
          .where(eq(pairingTokens.id, id))
          .returning({ id: pairingTokens.id, cancelledAt: pairingTokens.cancelledAt });

        await logAudit(tx, { actor: staff.farmMembershipId, action: "cancel_pairing_token", target: id, farmId: staff.farmId });

        return { pairingToken: cancelled };
      });
    },
  );

  // The printed QR link — a bearer credential, not a staff action (plan §3.4/§10).
  app.post("/pair/:token", async (request) => {
    const { token } = request.params as { token: string };
    const now = new Date();

    return deps.db.transaction(async (tx) => {
      const [row] = await tx
        .select({ pairingToken: pairingTokens, farmId: devices.farmId })
        .from(pairingTokens)
        .innerJoin(devices, eq(devices.id, pairingTokens.deviceId))
        .where(eq(pairingTokens.token, token))
        .for("update");
      if (!row) throw notFound();

      requirePending(row.pairingToken, now);

      const ceiling = await activeModuleCodes(tx, row.farmId);
      if (!ceiling.includes(row.pairingToken.moduleCode)) {
        throw forbidden("not_licensed", `Farm is not licensed for module: ${row.pairingToken.moduleCode}`);
      }

      await tx.update(pairingTokens).set({ usedAt: now }).where(eq(pairingTokens.id, row.pairingToken.id));

      await tx
        .insert(deviceModules)
        .values({ deviceId: row.pairingToken.deviceId, moduleCode: row.pairingToken.moduleCode })
        .onConflictDoNothing();

      const floorRows = await tx.select({ moduleCode: deviceModules.moduleCode }).from(deviceModules).where(eq(deviceModules.deviceId, row.pairingToken.deviceId));
      const floor = floorRows.map((r) => r.moduleCode);

      const ticket = await mintTicket({
        farmId: row.farmId,
        deviceId: row.pairingToken.deviceId,
        farmModules: ceiling,
        deviceModules: floor,
        signingKey: deps.keys.privateKey,
        now,
      });

      await logAudit(tx, {
        actor: `device:${row.pairingToken.deviceId}`,
        action: "pair",
        target: row.pairingToken.moduleCode,
        farmId: row.farmId,
      });

      return {
        ticket,
        farmId: row.farmId,
        deviceId: row.pairingToken.deviceId,
        modules: floor.filter((m) => ceiling.includes(m)),
      };
    });
  });
}
