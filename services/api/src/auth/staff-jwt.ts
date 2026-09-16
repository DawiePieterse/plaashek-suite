import { jwtVerify, SignJWT } from "jose";

export type Role = "admin" | "owner";

export interface StaffClaims {
  farmMembershipId: string;
  farmId: string;
  role: Role;
}

const STAFF_SESSION_LIFE_HOURS = 12;

export async function signStaffSession(claims: StaffClaims, secret: string): Promise<string> {
  const key = Buffer.from(secret, "base64");

  return new SignJWT({ farm_id: claims.farmId, role: claims.role })
    .setProtectedHeader({ alg: "HS256" })
    .setSubject(claims.farmMembershipId)
    .setIssuedAt()
    .setExpirationTime(`${STAFF_SESSION_LIFE_HOURS}h`)
    .sign(key);
}

export async function verifyStaffSession(token: string, secret: string): Promise<StaffClaims> {
  const key = Buffer.from(secret, "base64");
  const { payload } = await jwtVerify(token, key, { algorithms: ["HS256"] });

  return {
    farmMembershipId: payload.sub as string,
    farmId: payload["farm_id"] as string,
    role: payload["role"] as Role,
  };
}
