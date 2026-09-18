import { deviceAssignments, deviceModules, devices, entitlements, farmMemberships, farms, organisations, people, plaashekStaff } from "@plaashek/schema";
import { mintTicket } from "@plaashek/tickets";
import type { AppDeps } from "../app.js";
import type { Db } from "../db.js";
import type { Role } from "../auth/staff-jwt.js";
import { hashPassword } from "../auth/password.js";

/** A minimal farm + one staff member, for tests that need a real farmMembership to sign a session for. */
export async function seedFarm(db: Db, opts: { role?: Role; email?: string } = {}) {
  const [org] = await db.insert(organisations).values({ name: "Org" }).returning();
  const [farm] = await db.insert(farms).values({ organisationId: org.id, name: "Farm" }).returning();
  const [person] = await db.insert(people).values({ farmId: farm.id, name: "Person" }).returning();
  const [membership] = await db
    .insert(farmMemberships)
    .values({ farmId: farm.id, personId: person.id, email: opts.email ?? `staff-${farm.id}@example.com`, role: opts.role ?? "admin" })
    .returning();

  return { org, farm, person, membership };
}

/** A Plaashek Management login, for tests that need a real plaashekStaff row to sign a session for. */
export async function seedManagementStaff(db: Db, opts: { email?: string; password?: string } = {}) {
  const email = opts.email ?? `management-${crypto.randomUUID()}@example.com`;
  const password = opts.password ?? "test-password";
  const [staff] = await db.insert(plaashekStaff).values({ email, passwordHash: hashPassword(password) }).returning();

  return { staff, password };
}

/**
 * A farm with one phone paired for `moduleCode`, assigned to one person —
 * the shape every sync test starts from. Assigned in the past so a capture
 * dated mid-test still finds its assignment (plan §3.2).
 */
export async function pairedPhone(db: Db, moduleCode: string, status: "active" | "grace" | "suspended" | "cancelled" = "active") {
  const { org, farm, person, membership } = await seedFarm(db);
  await db.insert(entitlements).values({ farmId: farm.id, moduleCode, status });

  const [device] = await db.insert(devices).values({ farmId: farm.id, label: "Toetsfoon" }).returning();
  await db.insert(deviceModules).values({ deviceId: device.id, moduleCode });
  await db
    .insert(deviceAssignments)
    .values({ deviceId: device.id, personId: person.id, assignedBy: membership.id, assignedAt: new Date("2026-01-01T00:00:00Z") });

  return { org, farm, person, membership, device };
}

/** The ticket that phone would carry. `farmModules` defaults to the same module — pass `[]` for a lapsed licence. */
export function ticketFor(
  deps: AppDeps,
  farm: { id: string },
  device: { id: string },
  modules: string[],
  opts: { farmModules?: string[]; seasonId?: string | null } = {},
) {
  return mintTicket({
    farmId: farm.id,
    deviceId: device.id,
    farmModules: opts.farmModules ?? modules,
    deviceModules: modules,
    language: "af",
    seasonId: opts.seasonId ?? null,
    signingKey: deps.keys.privateKey,
  });
}
