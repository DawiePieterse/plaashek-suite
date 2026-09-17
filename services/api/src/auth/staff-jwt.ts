import { signSession, verifySessionPayload } from "./session-jwt.js";

export type Role = "admin" | "owner";

export interface StaffClaims {
  farmMembershipId: string;
  farmId: string;
  role: Role;
}

export async function signStaffSession(claims: StaffClaims, secret: string): Promise<string> {
  return signSession(claims.farmMembershipId, { farm_id: claims.farmId, role: claims.role }, secret);
}

export async function verifyStaffSession(token: string, secret: string): Promise<StaffClaims> {
  const payload = await verifySessionPayload(token, secret);

  return {
    farmMembershipId: payload.sub as string,
    farmId: payload["farm_id"] as string,
    role: payload["role"] as Role,
  };
}
