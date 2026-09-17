/**
 * Turns Span's punch stream into what the owner actually asks for — days and
 * hours per person (docs/span-build-scope.md). Derived at read time, never
 * stored: a punch that arrives late from a phone at the gate changes the
 * answer, and a stored total would quietly not change with it.
 */

export interface Punch {
  personId: string;
  personName: string;
  direction: string;
  at: Date;
}

export interface PersonAttendance {
  personId: string;
  personName: string;
  /** Calendar days on which a shift was closed — counted from the day the shift started. */
  days: number;
  hours: number;
  /** Punches that never paired: still clocked in, a forgotten `out`, or an `out` with no `in`. */
  openPunches: number;
}

/**
 * Plaashek hosts and sells in one country (plan §10), so the farm's day is
 * SAST. Give `farms` a timezone column the day that stops being true — the
 * only thing this decides is which calendar day a shift is counted on.
 */
const FARM_TIME_ZONE = "Africa/Johannesburg";

const dayKey = (at: Date) => at.toLocaleDateString("en-CA", { timeZone: FARM_TIME_ZONE });

/**
 * Pairs each `in` with the `out` that follows it, in time order, per person.
 * Anything that does not pair is reported as open rather than guessed at —
 * the phone never refuses a punch (plan §8), so the office is the only place
 * a missing `out` can be seen, and hiding it would defeat the point.
 */
export function rollUpAttendance(punches: Punch[]): PersonAttendance[] {
  const byPerson = new Map<string, Punch[]>();
  for (const punch of punches) {
    const existing = byPerson.get(punch.personId);
    if (existing) existing.push(punch);
    else byPerson.set(punch.personId, [punch]);
  }

  const people: PersonAttendance[] = [];

  for (const [personId, ownPunches] of byPerson) {
    const ordered = [...ownPunches].sort((a, b) => a.at.getTime() - b.at.getTime());
    const days = new Set<string>();
    let milliseconds = 0;
    let openPunches = 0;
    let openedAt: Date | null = null;

    for (const punch of ordered) {
      if (punch.direction === "in") {
        // A second `in` means the previous shift was never closed — count it
        // as open and start fresh rather than inventing an end for it.
        if (openedAt) openPunches += 1;
        openedAt = punch.at;
        continue;
      }

      if (!openedAt) {
        openPunches += 1; // an `out` with nothing open
        continue;
      }

      milliseconds += punch.at.getTime() - openedAt.getTime();
      days.add(dayKey(openedAt));
      openedAt = null;
    }

    if (openedAt) openPunches += 1; // still clocked in, or went home without clocking out

    people.push({
      personId,
      personName: ordered[0].personName,
      days: days.size,
      hours: Math.round((milliseconds / 3_600_000) * 100) / 100,
      openPunches,
    });
  }

  return people.sort((a, b) => a.personName.localeCompare(b.personName));
}
