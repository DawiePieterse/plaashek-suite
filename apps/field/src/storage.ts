/**
 * Whatever the phone remembers between opens — a cached picker list, the last
 * punch. Every read has to survive a private window, cleared site data and a
 * half-written value, because a phone that white-screens mid-pick loses the
 * day (plan §8).
 *
 * The outbox has its own reader in `queue.ts`: it carries a schema version
 * and a migration, which this deliberately does not.
 */
export function readStored<T>(key: string, fallback: T): T {
  try {
    const raw = globalThis.localStorage?.getItem(key);
    return raw ? (JSON.parse(raw) as T) : fallback;
  } catch {
    return fallback;
  }
}

export function writeStored(key: string, value: unknown) {
  try {
    globalThis.localStorage?.setItem(key, JSON.stringify(value));
  } catch {
    // Blocked storage costs the phone its cache, never the capture in hand.
  }
}
