import { auditLog } from "@plaashek/schema";
import type { Db } from "../db.js";

/** Every hek-api action is a farm-side actor this pass — plan §6 (actor_type: farm|staff). */
export function logAudit(
  db: Pick<Db, "insert">,
  entry: { actor: string; action: string; target: string; farmId: string },
) {
  return db.insert(auditLog).values({ ...entry, actorType: "farm" });
}
