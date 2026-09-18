import { farmDayKey } from "./farm-day.js";

/**
 * What a picker earned, from the crates they actually filled and the rate
 * that was in force on the day they filled them (ADR 0010,
 * docs/piecework-build-scope.md).
 *
 * Money is integer cents everywhere in here. Nothing is stored: a crate that
 * reaches the server late changes the answer, which is correct, and a
 * snapshotted total would quietly not change with it.
 */

/** A rate row as the schema stores it — effective-dated, never edited in place. */
export interface Rate {
  /** `YYYY-MM-DD`, the day this rate starts applying. */
  effectiveFrom: string;
  baseCentsPerKg: number;
  /** Kilograms in one day before the bonus rate kicks in. Null means no tier. */
  targetKg: number | null;
  bonusCentsPerKg: number | null;
}

export interface Crate {
  pickerId: string;
  pickerName: string;
  at: Date;
  /** Weight minus deduction — what the picker is actually paid on. */
  netKg: number;
}

/**
 * What a picker is paid on: the weight in the crate, less whatever was
 * deducted. Stated once — the payout, the CSV and anything that follows must
 * not each decide this separately.
 */
export const netKg = (weightKg: number, deductionKg: number | null) => weightKg - (deductionKg ?? 0);

/** One picker's kilograms on one farm day — the unit pay is calculated on. */
export interface PersonDay {
  personId: string;
  personName: string;
  /** Farm-local `YYYY-MM-DD`. */
  day: string;
  kg: number;
}

export interface PersonPay {
  personId: string;
  personName: string;
  kg: number;
  days: number;
  cents: number;
  /** Kilograms picked on a day no rate covers — counted, but worth nothing until the office sets one. */
  unratedKg: number;
}

/** The rate in force on a given day: the latest one that had started by then. */
export function rateOn(day: string, rates: Rate[]): Rate | null {
  let winner: Rate | null = null;
  for (const rate of rates) {
    if (rate.effectiveFrom <= day && (!winner || rate.effectiveFrom > winner.effectiveFrom)) winner = rate;
  }
  return winner;
}

/**
 * A day's pay under one rate. The tier is daily, so this is the only level at
 * which it can be applied: splitting the target across crates would pay a
 * bonus on the first crate of the morning, and summing a week first would pay
 * one target for five days.
 */
export function dayCents(kg: number, rate: Rate): number {
  if (rate.targetKg === null || rate.bonusCentsPerKg === null) return Math.round(kg * rate.baseCentsPerKg);

  const atBase = Math.min(kg, rate.targetKg);
  const aboveTarget = Math.max(0, kg - rate.targetKg);
  // Rounded once, at the day — the unit the farm actually pays on.
  return Math.round(atBase * rate.baseCentsPerKg + aboveTarget * rate.bonusCentsPerKg);
}

/**
 * Crates gathered into pay units: one picker, one farm day. Both the payout
 * rollup and the payroll CSV start here, so "what a picker is paid on" is
 * decided once — the CSV emits a row per unit, the rollup sums them per
 * person.
 */
export function byPersonDay(crates: Crate[]): PersonDay[] {
  const buckets = new Map<string, PersonDay>();

  for (const crate of crates) {
    const day = farmDayKey(crate.at);
    const key = `${crate.pickerId}|${day}`;
    const bucket = buckets.get(key) ?? { personId: crate.pickerId, personName: crate.pickerName, day, kg: 0 };
    bucket.kg += crate.netKg;
    buckets.set(key, bucket);
  }

  return [...buckets.values()];
}

/** Totals per picker over whatever crates it is handed, priced day by day. */
export function rollUpPiecework(crates: Crate[], rates: Rate[]): PersonPay[] {
  const byPerson = new Map<string, { name: string; days: Map<string, number> }>();

  for (const unit of byPersonDay(crates)) {
    const person = byPerson.get(unit.personId) ?? { name: unit.personName, days: new Map<string, number>() };
    person.days.set(unit.day, unit.kg);
    byPerson.set(unit.personId, person);
  }

  const people: PersonPay[] = [];

  for (const [personId, person] of byPerson) {
    let kg = 0;
    let cents = 0;
    let unratedKg = 0;

    for (const [day, dayKg] of person.days) {
      kg += dayKg;
      const rate = rateOn(day, rates);
      if (!rate) {
        // Never silently price a day at zero and call it paid — say the kg exist and the rate does not.
        unratedKg += dayKg;
        continue;
      }
      cents += dayCents(dayKg, rate);
    }

    people.push({
      personId,
      personName: person.name,
      kg: Math.round(kg * 100) / 100,
      days: person.days.size,
      cents,
      unratedKg: Math.round(unratedKg * 100) / 100,
    });
  }

  return people.sort((a, b) => a.personName.localeCompare(b.personName));
}
