import { signSession, verifySessionPayload } from "./session-jwt.js";

/** Cross-farm, unlike farm StaffClaims — kept on its own secret so a farm login can never verify here. */
export interface ManagementClaims {
  staffId: string;
  email: string;
}

export async function signManagementSession(claims: ManagementClaims, secret: string): Promise<string> {
  return signSession(claims.staffId, { email: claims.email }, secret);
}

export async function verifyManagementSession(token: string, secret: string): Promise<ManagementClaims> {
  const payload = await verifySessionPayload(token, secret);

  return {
    staffId: payload.sub as string,
    email: payload["email"] as string,
  };
}
