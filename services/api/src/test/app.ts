import { randomBytes } from "node:crypto";
import { exportJWK, generateKeyPair } from "jose";
import { buildApp, type App, type AppDeps } from "../app.js";
import type { Db } from "../db.js";

export async function buildTestApp(db: Db): Promise<{ app: App; deps: AppDeps }> {
  const { privateKey, publicKey } = await generateKeyPair("EdDSA");
  const publicJwk = await exportJWK(publicKey);

  const deps: AppDeps = {
    db,
    keys: {
      privateKey,
      publicKey,
      jwks: { keys: [{ ...publicJwk, kid: "test", use: "sig", alg: "EdDSA" }] },
    },
    env: {
      databaseUrl: "unused-in-tests",
      ticketSigningKeyJwk: "unused-in-tests",
      staffSessionSecret: randomBytes(32).toString("base64"),
      managementSessionSecret: randomBytes(32).toString("base64"),
      fieldAppUrl: "http://localhost:5174",
      port: 0,
      corsOrigins: [],
    },
  };

  return { app: buildApp(deps), deps };
}
