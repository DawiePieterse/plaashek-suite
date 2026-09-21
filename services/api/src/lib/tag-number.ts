/**
 * The farm's own ear tag for an animal (ADR 0011's pattern, applied to
 * livestock by ADR 0014): typed by the office, never generated here.
 */

/** Same normalisation as a worker number: case and stray spaces/hyphens are noise, leading zeros are not. */
export function normaliseTagNumber(raw: string): string {
  return raw.trim().toUpperCase().replace(/[\s-]/g, "");
}
