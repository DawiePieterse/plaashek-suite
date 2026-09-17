import type { FastifyReply, FastifyRequest } from "fastify";
import { bearerToken } from "../lib/http.js";
import { unauthorized } from "../lib/errors.js";
import { verifyManagementSession, type ManagementClaims } from "./management-jwt.js";

declare module "fastify" {
  interface FastifyRequest {
    management?: ManagementClaims;
  }
}

/** Plaashek Management only — farms cannot see this layer or reach it with a farm session token (plan §3.1). */
export function requireManagement(secret: string) {
  return async function (request: FastifyRequest, _reply: FastifyReply) {
    const token = bearerToken(request.headers.authorization);
    if (!token) throw unauthorized("unauthenticated", "Missing bearer token");

    try {
      request.management = await verifyManagementSession(token, secret);
    } catch {
      throw unauthorized("unauthenticated", "Invalid or expired session");
    }
  };
}
