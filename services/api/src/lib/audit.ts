import { auditLog } from "@plaashek/schema";
import type { Db } from "../db.js";

/** actorType defaults to "farm" — Plaashek Management routes pass "staff" (plan §6: actor_type farm|staff). */
export function logAudit(
  db: Pick<Db, "insert">,
  entry: { actor: string; action: string; target: string; farmId: string; actorType?: "farm" | "staff" },
) {
  const { actorType = "farm", ...rest } = entry;
  return db.insert(auditLog).values({ ...rest, actorType });
}
