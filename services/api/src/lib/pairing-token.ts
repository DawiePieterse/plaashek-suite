import { randomBytes } from "node:crypto";

/** Printed slip is a bearer credential — plan §3.4/§10. */
export const PAIRING_TOKEN_LIFE_HOURS = 48;

export function randomPairingToken(): string {
  return randomBytes(24).toString("base64url");
}

export function pairingExpiry(now: Date): Date {
  return new Date(now.getTime() + PAIRING_TOKEN_LIFE_HOURS * 60 * 60 * 1000);
}

export function qrUrl(token: string, baseUrl: string): string {
  return `${baseUrl}/pair/${token}`;
}
