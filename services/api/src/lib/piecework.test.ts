import assert from "node:assert/strict";
import test from "node:test";
import { dayCents, rateOn, rollUpPiecework, type Crate, type Rate } from "./piecework.js";

const flat: Rate = { effectiveFrom: "2026-09-01", baseCentsPerKg: 250, targetKg: null, bonusCentsPerKg: null };
const tiered: Rate = { effectiveFrom: "2026-09-01", baseCentsPerKg: 250, targetKg: 100, bonusCentsPerKg: 400 };

function crate(pickerId: string, at: string, netKg: number, pickerName = "Anna April"): Crate {
  return { pickerId, pickerName, at: new Date(at), netKg };
}

test("a flat rate pays every kilogram the same", () => {
  assert.equal(dayCents(80, flat), 20_000);
});

test("the tier pays the base up to the target and the bonus above it", () => {
  // 100 kg at 250c + 20 kg at 400c
  assert.equal(dayCents(120, tiered), 100 * 250 + 20 * 400);
});

test("under the target, the bonus never applies", () => {
  assert.equal(dayCents(99.5, tiered), Math.round(99.5 * 250));
});

test("the target is daily, not weekly — five 80kg days earn no bonus", () => {
  const fiveDays = [1, 2, 3, 4, 5].map((d) => crate("anna", `2026-09-0${d}T08:00:00Z`, 80));
  const [anna] = rollUpPiecework(fiveDays, [tiered]);

  assert.equal(anna.kg, 400);
  assert.equal(anna.days, 5);
  assert.equal(anna.cents, 5 * 80 * 250);
});

test("crates within a day add up before the tier is applied", () => {
  // 60 + 60 in one day is one 120kg day: base on 100, bonus on 20.
  const [anna] = rollUpPiecework(
    [crate("anna", "2026-09-01T08:00:00Z", 60), crate("anna", "2026-09-01T13:00:00Z", 60)],
    [tiered],
  );

  assert.equal(anna.cents, 100 * 250 + 20 * 400);
  assert.equal(anna.days, 1);
});

test("a rate change mid-season does not restate the days before it", () => {
  const rates: Rate[] = [flat, { effectiveFrom: "2026-09-15", baseCentsPerKg: 300, targetKg: null, bonusCentsPerKg: null }];
  const [anna] = rollUpPiecework(
    [crate("anna", "2026-09-10T08:00:00Z", 100), crate("anna", "2026-09-20T08:00:00Z", 100)],
    rates,
  );

  assert.equal(anna.cents, 100 * 250 + 100 * 300);
});

test("rateOn picks the latest rate that had started", () => {
  const rates: Rate[] = [flat, { effectiveFrom: "2026-09-15", baseCentsPerKg: 300, targetKg: null, bonusCentsPerKg: null }];

  assert.equal(rateOn("2026-09-14", rates)?.baseCentsPerKg, 250);
  assert.equal(rateOn("2026-09-15", rates)?.baseCentsPerKg, 300);
  assert.equal(rateOn("2026-08-31", rates), null);
});

test("kilograms picked before any rate exists are reported, not priced at zero", () => {
  const [anna] = rollUpPiecework([crate("anna", "2026-08-20T08:00:00Z", 40)], [flat]);

  assert.equal(anna.kg, 40);
  assert.equal(anna.unratedKg, 40);
  assert.equal(anna.cents, 0);
});

test("pickers are separate, sorted by name", () => {
  const people = rollUpPiecework(
    [crate("piet", "2026-09-01T08:00:00Z", 50, "Piet Plaas"), crate("anna", "2026-09-01T08:00:00Z", 30)],
    [flat],
  );

  assert.deepEqual(
    people.map((person) => [person.personName, person.cents]),
    [
      ["Anna April", 30 * 250],
      ["Piet Plaas", 50 * 250],
    ],
  );
});

test("a day that runs past midnight UTC is still one farm day", () => {
  // 20:00 and 23:30 SAST on the 1st — the second is 21:30 UTC on the 1st,
  // both the same farm day, so the tier sees 120kg not two 60kg days.
  const [anna] = rollUpPiecework(
    [crate("anna", "2026-09-01T18:00:00Z", 60), crate("anna", "2026-09-01T21:30:00Z", 60)],
    [tiered],
  );

  assert.equal(anna.days, 1);
  assert.equal(anna.cents, 100 * 250 + 20 * 400);
});
