import { SignJWT, jwtVerify, type KeyLike } from "jose";

type SigningKey = KeyLike;

/** Plan §9: farm ceiling + device floor, verifiable offline. ADR 0003: 21 days. */
export const TICKET_LIFE_DAYS = 21;

/** What a device's ticket says it may do — the modules its own home screen unlocks. */
export interface TicketClaims {
  farmId: string;
  deviceId: string;
  /** Intersection of the farm's licensed modules and this device's scanned modules. */
  modules: string[];
  issuedAt: Date;
  expiresAt: Date;
}

export interface MintTicketInput {
  farmId: string;
  deviceId: string;
  /** Modules the farm is currently licensed for — the ceiling. */
  farmModules: string[];
  /** Modules this device has scanned a pairing QR for — the floor. */
  deviceModules: string[];
  signingKey: SigningKey;
  /** Injectable for tests; defaults to the real clock. */
  now?: Date;
}

/**
 * Signs a device ticket. `modules` is the floor clipped to the ceiling —
 * a module the device paired for but the farm has since dropped never
 * makes it into the signed claims, so the field app just stops offering it.
 */
export async function mintTicket(input: MintTicketInput): Promise<string> {
  const now = input.now ?? new Date();
  const modules = input.deviceModules.filter((m) => input.farmModules.includes(m));

  return new SignJWT({ farm_id: input.farmId, modules })
    .setProtectedHeader({ alg: "EdDSA" })
    .setSubject(input.deviceId)
    .setIssuedAt(now)
    .setExpirationTime(new Date(now.getTime() + TICKET_LIFE_DAYS * 24 * 60 * 60 * 1000))
    .sign(input.signingKey);
}

/** Verifies signature and expiry. Throws (jose's `JWTExpired`, `JWSSignatureVerificationFailed`, ...) on failure. */
export async function verifyTicket(
  token: string,
  publicKey: SigningKey,
  now?: Date,
): Promise<TicketClaims> {
  const { payload } = await jwtVerify(token, publicKey, {
    algorithms: ["EdDSA"],
    currentDate: now,
  });

  return {
    farmId: payload["farm_id"] as string,
    deviceId: payload.sub as string,
    modules: payload["modules"] as string[],
    issuedAt: new Date((payload.iat as number) * 1000),
    expiresAt: new Date((payload.exp as number) * 1000),
  };
}
