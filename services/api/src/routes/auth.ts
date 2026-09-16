import { farmMemberships } from "@plaashek/schema";
import { eq } from "drizzle-orm";
import type { App, AppDeps } from "../app.js";
import { verifyPassword } from "../auth/password.js";
import { signStaffSession } from "../auth/staff-jwt.js";
import { unauthorized } from "../lib/errors.js";
import { loginRequestSchema } from "../schemas/auth.js";

export function registerAuthRoutes(app: App, deps: AppDeps) {
  app.post("/auth/login", async (request) => {
    const { email, password } = loginRequestSchema.parse(request.body);

    const [membership] = await deps.db
      .select()
      .from(farmMemberships)
      .where(eq(farmMemberships.email, email))
      .limit(1);

    if (!membership?.passwordHash || !verifyPassword(password, membership.passwordHash)) {
      throw unauthorized("invalid_credentials", "Incorrect email or password");
    }

    const token = await signStaffSession(
      { farmMembershipId: membership.id, farmId: membership.farmId, role: membership.role },
      deps.env.staffSessionSecret,
    );

    return { token, farmMembershipId: membership.id, farmId: membership.farmId, role: membership.role };
  });
}
