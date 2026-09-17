import { jwtVerify, SignJWT } from "jose";

const SESSION_LIFE_HOURS = 12;

/** Shared HS256 session plumbing — staff-jwt.ts and management-jwt.ts each keep their own secret and claims shape. */
export async function signSession(subject: string, claims: Record<string, string>, secret: string): Promise<string> {
  const key = Buffer.from(secret, "base64");

  return new SignJWT(claims)
    .setProtectedHeader({ alg: "HS256" })
    .setSubject(subject)
    .setIssuedAt()
    .setExpirationTime(`${SESSION_LIFE_HOURS}h`)
    .sign(key);
}

export async function verifySessionPayload(token: string, secret: string) {
  const key = Buffer.from(secret, "base64");
  const { payload } = await jwtVerify(token, key, { algorithms: ["HS256"] });
  return payload;
}
