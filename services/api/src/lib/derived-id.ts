import { createHash } from "node:crypto";

/**
 * A stable, valid-format uuid derived from a seed string — used only where
 * one sync op has to write more than one row (Bespuiting's application also
 * books a Stoor stock-out and, optionally, a Water reading — see
 * docs/bespuiting-build-scope.md). Those rows need their own primary keys,
 * but a retried sync op must produce the exact same keys each time or the
 * retry double-books the shelf. `crypto.randomUUID()` cannot do that — it is
 * random by design — so this hashes the seed instead. Not a real UUIDv5,
 * just a UUID-shaped value that is the same every time for the same seed.
 */
export function derivedId(seed: string): string {
  const hash = createHash("sha256").update(seed).digest("hex");
  return [
    hash.slice(0, 8),
    hash.slice(8, 12),
    `4${hash.slice(13, 16)}`,
    `${((parseInt(hash[16], 16) & 0x3) | 0x8).toString(16)}${hash.slice(17, 20)}`,
    hash.slice(20, 32),
  ].join("-");
}
