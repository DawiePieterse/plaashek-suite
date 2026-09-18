import { deviceAssignments, deviceModules, devices, pairingTokens, people } from "@plaashek/schema";
import { and, eq, inArray, isNull } from "drizzle-orm";
import type { App, AppDeps } from "../app.js";
import { requireStaff } from "../auth/require-staff.js";
import { logAudit } from "../lib/audit.js";
import { activeModuleCodes } from "../lib/entitlements.js";
import { forbidden } from "../lib/errors.js";
import { assertFarmOwns } from "../lib/farm.js";
import { pairingExpiry, qrUrl, randomPairingToken } from "../lib/pairing-token.js";
import { addAppRequestSchema, addDeviceRequestSchema } from "../schemas/devices.js";

export function registerDeviceRoutes(app: App, deps: AppDeps) {
  app.get("/devices", { preHandler: requireStaff(deps.env.staffSessionSecret, ["admin", "owner"]) }, async (request) => {
    const farmId = request.staff!.farmId;

    const farmDevices = await deps.db.select().from(devices).where(eq(devices.farmId, farmId));
    const deviceIds = farmDevices.map((d) => d.id);
    if (deviceIds.length === 0) return { devices: [] };

    const [assignments, modules, pendingTokens] = await Promise.all([
      deps.db
        .select({ deviceId: deviceAssignments.deviceId, assignedAt: deviceAssignments.assignedAt, personId: people.id, personName: people.name })
        .from(deviceAssignments)
        .innerJoin(people, eq(people.id, deviceAssignments.personId))
        .where(inArray(deviceAssignments.deviceId, deviceIds)),
      deps.db.select().from(deviceModules).where(inArray(deviceModules.deviceId, deviceIds)),
      deps.db.select().from(pairingTokens).where(and(inArray(pairingTokens.deviceId, deviceIds), isNull(pairingTokens.usedAt), isNull(pairingTokens.cancelledAt))),
    ]);

    // Sort ascending then overwrite — last write per deviceId is the latest assignment.
    const latestAssignmentByDevice = new Map<string, { personId: string; personName: string }>();
    for (const a of [...assignments].sort((x, y) => x.assignedAt.getTime() - y.assignedAt.getTime())) {
      latestAssignmentByDevice.set(a.deviceId, { personId: a.personId, personName: a.personName });
    }

    return {
      devices: farmDevices.map((device) => ({
        id: device.id,
        label: device.label,
        createdAt: device.createdAt,
        assignedPerson: latestAssignmentByDevice.get(device.id) ?? null,
        modules: modules.filter((m) => m.deviceId === device.id).map((m) => m.moduleCode),
        pendingPairingTokens: pendingTokens
          .filter((t) => t.deviceId === device.id && t.expiresAt > new Date())
          .map((t) => ({ id: t.id, moduleCode: t.moduleCode, expiresAt: t.expiresAt, printedAt: t.printedAt })),
      })),
    };
  });

  app.post(
    "/devices",
    { preHandler: requireStaff(deps.env.staffSessionSecret, ["admin", "owner"]) },
    async (request) => {
      const staff = request.staff!;
      const { personId, moduleCode, label } = addDeviceRequestSchema.parse(request.body);

      await assertFarmOwns(deps.db, people, people.id, people.farmId, personId, staff.farmId);

      const ceiling = await activeModuleCodes(deps.db, staff.farmId);
      if (!ceiling.includes(moduleCode)) {
        throw forbidden("not_licensed", `Farm is not licensed for module: ${moduleCode}`);
      }

      const now = new Date();

      return deps.db.transaction(async (tx) => {
        const [device] = await tx.insert(devices).values({ farmId: staff.farmId, label: label ?? null }).returning();

        await tx.insert(deviceAssignments).values({ deviceId: device.id, personId, assignedBy: staff.farmMembershipId });

        const [pairingToken] = await tx
          .insert(pairingTokens)
          .values({
            deviceId: device.id,
            moduleCode,
            token: randomPairingToken(),
            printedBy: staff.farmMembershipId,
            expiresAt: pairingExpiry(now),
          })
          .returning();

        await logAudit(tx, { actor: staff.farmMembershipId, action: "add_device", target: device.id, farmId: staff.farmId });

        return { device, pairingToken: { ...pairingToken, qrUrl: qrUrl(pairingToken.token, deps.env.fieldAppUrl) } };
      });
    },
  );

  app.post(
    "/devices/:deviceId/apps",
    { preHandler: requireStaff(deps.env.staffSessionSecret, ["admin", "owner"]) },
    async (request) => {
      const staff = request.staff!;
      const { deviceId } = request.params as { deviceId: string };
      const { moduleCode } = addAppRequestSchema.parse(request.body);

      await assertFarmOwns(deps.db, devices, devices.id, devices.farmId, deviceId, staff.farmId);

      const ceiling = await activeModuleCodes(deps.db, staff.farmId);
      if (!ceiling.includes(moduleCode)) {
        throw forbidden("not_licensed", `Farm is not licensed for module: ${moduleCode}`);
      }

      const now = new Date();

      return deps.db.transaction(async (tx) => {
        const [pairingToken] = await tx
          .insert(pairingTokens)
          .values({
            deviceId,
            moduleCode,
            token: randomPairingToken(),
            printedBy: staff.farmMembershipId,
            expiresAt: pairingExpiry(now),
          })
          .returning();

        await logAudit(tx, { actor: staff.farmMembershipId, action: "add_app", target: deviceId, farmId: staff.farmId });

        return { pairingToken: { ...pairingToken, qrUrl: qrUrl(pairingToken.token, deps.env.fieldAppUrl) } };
      });
    },
  );

  app.post(
    "/devices/:deviceId/revoke",
    { preHandler: requireStaff(deps.env.staffSessionSecret, ["admin", "owner"]) },
    async (request) => {
      const staff = request.staff!;
      const { deviceId } = request.params as { deviceId: string };

      await assertFarmOwns(deps.db, devices, devices.id, devices.farmId, deviceId, staff.farmId);

      return deps.db.transaction(async (tx) => {
        const revoked = await tx.delete(deviceModules).where(eq(deviceModules.deviceId, deviceId)).returning({ moduleCode: deviceModules.moduleCode });

        await tx
          .update(pairingTokens)
          .set({ cancelledAt: new Date() })
          .where(and(eq(pairingTokens.deviceId, deviceId), isNull(pairingTokens.usedAt), isNull(pairingTokens.cancelledAt)));

        await logAudit(tx, { actor: staff.farmMembershipId, action: "revoke", target: deviceId, farmId: staff.farmId });

        return { deviceId, revokedModules: revoked.map((r) => r.moduleCode) };
      });
    },
  );
}
