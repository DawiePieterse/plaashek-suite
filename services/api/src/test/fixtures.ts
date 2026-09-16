import { farmMemberships, farms, organisations, people } from "@plaashek/schema";
import type { Db } from "../db.js";
import type { Role } from "../auth/staff-jwt.js";

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
