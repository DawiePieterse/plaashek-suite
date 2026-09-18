import { randomInt } from "node:crypto";

/**
 * The code on a printed worker card (ADR 0009). Crockford base32 without the
 * letters that get misread off a muddy card by someone typing it in as the
 * scan fallback — no I/L/O/U, so nothing collides with 1, 0 or a swearword.
 */
const ALPHABET = "0123456789ABCDEFGHJKMNPQRSTVWXYZ";
const LENGTH = 8;

/**
 * Not a credential (ADR 0009) — it identifies a picker, it does not grant
 * anything — but it is still guessed-at-scale cheap if it is short and
 * sequential, and a guessed code means someone else's pay. 8 characters of
 * this alphabet is ~40 bits, and the code is farm-scoped and unique-indexed,
 * so a collision is a retry rather than a mix-up.
 */
export function randomCardCode(): string {
  let code = "";
  for (let i = 0; i < LENGTH; i += 1) code += ALPHABET[randomInt(ALPHABET.length)];
  return code;
}

/**
 * What a supervisor typed is not what the office printed: lower case, spaces
 * from a card reader, and the classic O-for-0 substitution. Normalise both
 * sides of the comparison rather than making the farm care.
 */
export function normaliseCardCode(raw: string): string {
  return raw
    .trim()
    .toUpperCase()
    .replace(/[\s-]/g, "")
    .replace(/O/g, "0")
    .replace(/[IL]/g, "1");
}
