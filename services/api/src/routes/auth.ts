import { randomBytes } from "node:crypto";
import { farmMemberships } from "@plaashek/schema";
import { eq } from "drizzle-orm";
import type { App, AppDeps } from "../app.js";
import { hashPassword, verifyPassword } from "../auth/password.js";
import { signStaffSession } from "../auth/staff-jwt.js";
import { unauthorized } from "../lib/errors.js";
import { farmLanguage } from "../lib/farm.js";
import { loginRequestSchema } from "../schemas/auth.js";

/** Compared against when the email is unknown, so a miss costs the same scrypt time as a hit. */
const DUMMY_HASH = hashPassword(randomBytes(16).toString("hex"));

export function registerAuthRoutes(app: App, deps: AppDeps) {
  app.post("/auth/login", async (request) => {
    const { email, password } = loginRequestSchema.parse(request.body);

    const [membership] = await deps.db
      .select()
      .from(farmMemberships)
      .where(eq(farmMemberships.email, email))
      .limit(1);

    const passwordOk = verifyPassword(password, membership?.passwordHash ?? DUMMY_HASH);
    if (!membership?.passwordHash || !passwordOk) {
      throw unauthorized("invalid_credentials", "Incorrect email or password");
    }

    const token = await signStaffSession(
      { farmMembershipId: membership.id, farmId: membership.farmId, role: membership.role },
      deps.env.staffSessionSecret,
    );

    return {
      token,
      farmMembershipId: membership.id,
      farmId: membership.farmId,
      role: membership.role,
      language: await farmLanguage(deps.db, membership.farmId),
    };
  });
}
