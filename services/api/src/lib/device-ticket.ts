import { verifyTicket, type TicketClaims } from "@plaashek/tickets";
import type { AppDeps } from "../app.js";
import { unauthorized } from "./errors.js";
import { bearerToken } from "./http.js";

/** The bearer-ticket check every device-facing route needs: sync, ticket refresh, weather. */
export async function requireDeviceTicket(headers: { authorization?: string }, deps: Pick<AppDeps, "keys">): Promise<TicketClaims> {
  const token = bearerToken(headers.authorization);
  if (!token) throw unauthorized("unauthenticated", "Missing device ticket");

  try {
    return await verifyTicket(token, deps.keys.publicKey);
  } catch (error) {
    const code = (error as { code?: string }).code;
    if (code === "ERR_JWT_EXPIRED") throw unauthorized("ticket_expired", "Device ticket has expired");
    throw unauthorized("ticket_invalid", "Device ticket is invalid");
  }
}
