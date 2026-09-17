import assert from "node:assert/strict";
import test from "node:test";
import { rollUpAttendance, type Punch } from "./attendance.js";

function punch(direction: "in" | "out", at: string, personId = "anna", personName = "Anna April"): Punch {
  return { personId, personName, direction, at: new Date(at) };
}

test("pairs each in with the out that follows it", () => {
  const [anna] = rollUpAttendance([punch("in", "2026-06-01T04:00:00Z"), punch("out", "2026-06-01T12:30:00Z")]);

  assert.equal(anna.hours, 8.5);
  assert.equal(anna.days, 1);
  assert.equal(anna.openPunches, 0);
});

test("counts days by the day the shift started, in farm time", () => {
  // 20:00 SAST Monday to 02:00 SAST Tuesday: one shift, counted on the Monday.
  const [anna] = rollUpAttendance([punch("in", "2026-06-01T18:00:00Z"), punch("out", "2026-06-02T00:00:00Z")]);

  assert.equal(anna.days, 1);
  assert.equal(anna.hours, 6);
});

test("a shift that was never closed is open, not guessed at", () => {
  const [anna] = rollUpAttendance([
    punch("in", "2026-06-01T04:00:00Z"),
    // No `out` for the first day — the phone never refuses a punch, so this happens.
    punch("in", "2026-06-02T04:00:00Z"),
    punch("out", "2026-06-02T12:00:00Z"),
  ]);

  assert.equal(anna.hours, 8);
  assert.equal(anna.days, 1);
  assert.equal(anna.openPunches, 1);
});

test("an out with nothing open is open too", () => {
  const [anna] = rollUpAttendance([punch("out", "2026-06-01T12:00:00Z")]);

  assert.equal(anna.hours, 0);
  assert.equal(anna.openPunches, 1);
});

test("still clocked in counts as open, with no hours yet", () => {
  const [anna] = rollUpAttendance([punch("in", "2026-06-01T04:00:00Z")]);

  assert.equal(anna.hours, 0);
  assert.equal(anna.days, 0);
  assert.equal(anna.openPunches, 1);
});

test("out-of-order arrival still pairs — a phone syncs a whole day at the gate", () => {
  const [anna] = rollUpAttendance([punch("out", "2026-06-01T12:00:00Z"), punch("in", "2026-06-01T04:00:00Z")]);

  assert.equal(anna.hours, 8);
  assert.equal(anna.openPunches, 0);
});

test("groups per person, sorted by name", () => {
  const people = rollUpAttendance([
    punch("in", "2026-06-01T04:00:00Z", "piet", "Piet Plaas"),
    punch("out", "2026-06-01T10:00:00Z", "piet", "Piet Plaas"),
    punch("in", "2026-06-01T04:00:00Z"),
    punch("out", "2026-06-01T08:00:00Z"),
  ]);

  assert.deepEqual(
    people.map((person) => [person.personName, person.hours]),
    [
      ["Anna April", 4],
      ["Piet Plaas", 6],
    ],
  );
});
