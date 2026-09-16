import { importJWK, type JWK, type KeyLike } from "jose";

export interface SigningKeys {
  privateKey: KeyLike;
  publicKey: KeyLike;
  /** For GET /.well-known/jwks.json — public fields only, never the private "d". */
  jwks: { keys: JWK[] };
}

const KID = "hek-1";

export async function loadSigningKeys(ticketSigningKeyJwk: string): Promise<SigningKeys> {
  const privateJwk = JSON.parse(ticketSigningKeyJwk) as JWK;
  const publicJwk: JWK = { kty: privateJwk.kty, crv: privateJwk.crv, x: privateJwk.x };

  const privateKey = (await importJWK(privateJwk, "EdDSA")) as KeyLike;
  const publicKey = (await importJWK(publicJwk, "EdDSA")) as KeyLike;

  return {
    privateKey,
    publicKey,
    jwks: { keys: [{ ...publicJwk, kid: KID, use: "sig", alg: "EdDSA" }] },
  };
}
