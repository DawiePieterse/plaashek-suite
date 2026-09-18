/**
 * The farm's own number for a worker (ADR 0011): typed by the office, printed
 * on the card, and the join key the farm's payment system already uses. We
 * never generate it, so we do not get to choose its shape either — "014",
 * "EMP-14" and "a12" are all somebody's real numbering scheme.
 */

/**
 * What a supervisor typed, or a scanner read, reduced to what the office
 * stored. Case and the spaces or hyphens a card reader adds are noise;
 * leading zeros are not — "014" and "14" are different numbers in a payroll,
 * so this never strips them.
 */
export function normaliseWorkerNumber(raw: string): string {
  return raw.trim().toUpperCase().replace(/[\s-]/g, "");
}
