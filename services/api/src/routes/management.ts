import { randomBytes } from "node:crypto";
import { entitlements, farms, organisations, plaashekStaff } from "@plaashek/schema";
import { eq } from "drizzle-orm";
import type { App, AppDeps } from "../app.js";
import { requireManagement } from "../auth/require-management.js";
import { hashPassword, verifyPassword } from "../auth/password.js";
import { signManagementSession } from "../auth/management-jwt.js";
import { logAudit } from "../lib/audit.js";
import { unauthorized } from "../lib/errors.js";
import { createFarmRequestSchema, managementLoginRequestSchema, setEntitlementRequestSchema } from "../schemas/management.js";

/** Compared against when the email is unknown, so a miss costs the same scrypt time as a hit. */
const DUMMY_HASH = hashPassword(randomBytes(16).toString("hex"));

/** Plaashek Management — cross-farm, staff-only (plan §4.1). Farms have no write path into this layer. */
export function registerManagementRoutes(app: App, deps: AppDeps) {
  app.post("/management/login", async (request) => {
    const { email, password } = managementLoginRequestSchema.parse(request.body);

    const [staff] = await deps.db.select().from(plaashekStaff).where(eq(plaashekStaff.email, email)).limit(1);

    const passwordOk = verifyPassword(password, staff?.passwordHash ?? DUMMY_HASH);
    if (!staff || !passwordOk) throw unauthorized("invalid_credentials", "Incorrect email or password");

    const token = await signManagementSession({ staffId: staff.id, email: staff.email }, deps.env.managementSessionSecret);

    return { token, staffId: staff.id, email: staff.email };
  });

  app.get("/management/farms", { preHandler: requireManagement(deps.env.managementSessionSecret) }, async () => {
    const rows = await deps.db
      .select({
        farm: { id: farms.id, name: farms.name, language: farms.language },
        organisation: { id: organisations.id, name: organisations.name },
      })
      .from(farms)
      .innerJoin(organisations, eq(farms.organisationId, organisations.id))
      .orderBy(farms.name);

    const farmsWithModules = await Promise.all(
      rows.map(async (row) => ({
        ...row,
        entitlements: await deps.db
          .select({ moduleCode: entitlements.moduleCode, status: entitlements.status })
          .from(entitlements)
          .where(eq(entitlements.farmId, row.farm.id)),
      })),
    );

    return { farms: farmsWithModules };
  });

  app.post("/management/farms", { preHandler: requireManagement(deps.env.managementSessionSecret) }, async (request) => {
    const staff = request.management!;
    const body = createFarmRequestSchema.parse(request.body);

    return deps.db.transaction(async (tx) => {
      const [org] = await tx.insert(organisations).values({ name: body.organisationName }).returning();
      const [farm] = await tx
        .insert(farms)
        .values({ organisationId: org.id, name: body.farmName, language: body.language })
        .returning();

      await logAudit(tx, { actor: staff.staffId, action: "create_farm", target: farm.id, farmId: farm.id, actorType: "staff" });

      return { organisation: org, farm };
    });
  });

  app.put(
    "/management/farms/:farmId/entitlements",
    { preHandler: requireManagement(deps.env.managementSessionSecret) },
    async (request) => {
      const staff = request.management!;
      const { farmId } = request.params as { farmId: string };
      const body = setEntitlementRequestSchema.parse(request.body);

      return deps.db.transaction(async (tx) => {
        const [entitlement] = await tx
          .insert(entitlements)
          .values({ farmId, moduleCode: body.moduleCode, status: body.status })
          .onConflictDoUpdate({
            target: [entitlements.farmId, entitlements.moduleCode],
            set: { status: body.status },
          })
          .returning();

        await logAudit(tx, {
          actor: staff.staffId,
          action: "set_entitlement",
          target: `${farmId}:${body.moduleCode}`,
          farmId,
          actorType: "staff",
        });

        return { entitlement };
      });
    },
  );
}
