/** Rand from cents — money is stored and sent as integer cents everywhere in this codebase (ADR 0010), never a float. */
export const rand = (cents: number) => (cents / 100).toFixed(2);
