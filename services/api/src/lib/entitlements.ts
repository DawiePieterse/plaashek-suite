import { entitlements } from "@plaashek/schema";
import { and, eq, inArray } from "drizzle-orm";
import type { Db } from "../db.js";

/** The farm's ceiling: modules it's licensed for right now (plan §5 — active and grace both mean full use). */
export async function activeModuleCodes(db: Pick<Db, "select">, farmId: string): Promise<string[]> {
  const rows = await db
    .select({ moduleCode: entitlements.moduleCode })
    .from(entitlements)
    .where(and(eq(entitlements.farmId, farmId), inArray(entitlements.status, ["active", "grace"])));

  return rows.map((r) => r.moduleCode);
}
