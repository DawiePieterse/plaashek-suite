// One-off: prints a fresh Ed25519 JWK pair to paste into .env as TICKET_SIGNING_KEY_JWK.
import { exportJWK, generateKeyPair } from "jose";

const { privateKey } = await generateKeyPair("EdDSA");
const jwk = await exportJWK(privateKey);

console.log(JSON.stringify(jwk));
