import type { FastifyReply, FastifyRequest } from "fastify";
import { bearerToken } from "../lib/http.js";
import { unauthorized, forbidden } from "../lib/errors.js";
import { verifyStaffSession, type Role, type StaffClaims } from "./staff-jwt.js";

declare module "fastify" {
  interface FastifyRequest {
    staff?: StaffClaims;
  }
}

export function requireStaff(secret: string, roles?: Role[]) {
  return async function (request: FastifyRequest, _reply: FastifyReply) {
    const token = bearerToken(request.headers.authorization);
    if (!token) throw unauthorized("unauthenticated", "Missing bearer token");

    let claims: StaffClaims;
    try {
      claims = await verifyStaffSession(token, secret);
    } catch {
      throw unauthorized("unauthenticated", "Invalid or expired session");
    }

    if (roles && !roles.includes(claims.role)) {
      throw forbidden("forbidden", `Requires role: ${roles.join(" or ")}`);
    }

    request.staff = claims;
  };
}
