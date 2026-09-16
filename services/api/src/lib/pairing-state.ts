import type { pairingTokens } from "@plaashek/schema";

export type PairingTokenRow = typeof pairingTokens.$inferSelect;

export type PairingTokenState = "pending" | "used" | "cancelled" | "expired";

/** State is derived, not stored — plan §3.4 (pending/used/cancelled/expired). */
export function pairingTokenState(row: PairingTokenRow, now: Date): PairingTokenState {
  if (row.usedAt) return "used";
  if (row.cancelledAt) return "cancelled";
  if (row.expiresAt <= now) return "expired";
  return "pending";
}
