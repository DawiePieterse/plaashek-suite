import { jwtVerify, SignJWT } from "jose";

/** Cross-farm, unlike farm StaffClaims — kept on its own secret so a farm login can never verify here. */
export interface ManagementClaims {
  staffId: string;
  email: string;
}

const MANAGEMENT_SESSION_LIFE_HOURS = 12;

export async function signManagementSession(claims: ManagementClaims, secret: string): Promise<string> {
  const key = Buffer.from(secret, "base64");

  return new SignJWT({ email: claims.email })
    .setProtectedHeader({ alg: "HS256" })
    .setSubject(claims.staffId)
    .setIssuedAt()
    .setExpirationTime(`${MANAGEMENT_SESSION_LIFE_HOURS}h`)
    .sign(key);
}

export async function verifyManagementSession(token: string, secret: string): Promise<ManagementClaims> {
  const key = Buffer.from(secret, "base64");
  const { payload } = await jwtVerify(token, key, { algorithms: ["HS256"] });

  return {
    staffId: payload.sub as string,
    email: payload["email"] as string,
  };
}
