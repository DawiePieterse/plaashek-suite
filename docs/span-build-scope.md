# Span build scope

**Date:** 17 September 2026
**Status:** scope — kicks off Phase 5 (plan §12, §11 order 4)
**Reference app:** none. Span is new (plan §11: reference column is `—`), so
this stands in for the reuse audits Phases 2 and 3 got — same job, deciding
what is in and what is out before any code, just without a reference app to
mine.

## Who Span is for

**Permanent employees** — confirmed by the farm 17 September 2026, after the
module shipped. One person, one paired phone, one clock. That is the shape
ADR 0008 chose and the shape it fits.

**Seasonal piece-workers are not in this module.** A litchi picking team paid
per kilogram is a different product: the pickers are transient, they do not
carry a phone each, and what has to be recorded is not when they arrived but
how much each of them picked. That needs picker-level attribution on a
harvest capture, which is exactly what [ADR 0007](decisions/0007-boord-no-worker-attribution.md)
refused and what [ADR 0008](decisions/0008-span-self-clocking.md) said would
be the signal to reopen §2.1 rather than decide it a third time inside a
module. It gets its own scope and its own decisions — do not stretch Span or
`attendance_punches` to cover it.

## What Span is

Clocking. A permanent worker's day starts and ends; the farm needs to know
when, per person, without a paper register that lives in a bakkie.

Plan §6 gives it one table, `attendance_punches`, and §11 gives it one line of
justification: *"Assigned-person stamp makes clocking work."* That sentence is
the whole design. Every Plaashek capture is already stamped with the person
the office assigned to that device (§3.2, §6). A punch is a capture with
nothing in it but a direction — in or out — so the stamp is the record.

## What that sentence rules in and out

| Question | Call |
|---|---|
| Who is being clocked? | The device's assigned person. Not a name picked on the phone — see [ADR 0008](decisions/0008-span-self-clocking.md). |
| One phone clocking a whole team? | No. That needs the in-app person picker §2.1 rules out. ADR 0008. |
| Where the punch happened | Stamped opportunistically from the same GPS warm-up `Notes.tsx` already does. Never blocks the save, never required. |
| Weather | No. It is on `notes` and `harvest_events` because those are agronomic records. When a worker clocked in is not a weather observation. |
| Season | Stamped, like every other capture. §6 names Werkswinkel and Water as the season-less modules; Span is not one of them — a farm that asks "how many hours went into the 2026/27 pick" needs the stamp to answer it. |
| Corrections | None. Append-only, same as notes and crates — plan §7 names punches in that list explicitly ("crates, treatments, punches, notes"), so ADR 0006's precedent applies with no new decision. A wrong punch is followed by a right one and the office reads the sequence. |
| Hours calculation | Office side only, computed at read time from the punch pairs. Nothing derived is stored — a stored total would be a second source of truth for something a late punch can change. |
| Wages | Out. Explicit non-goal (§2.1), same wall ADR 0007 hit. Span says when; it never says what that is worth. |
| Leave, absence reasons, shift rosters | Out of v1. A punch is an observed event; leave and rosters are planning data, which is a different (and much bigger) product. Revisit if a farm asks. |

## Build scope

1. `attendance_punches` (new table, plan §6 only lists the name so far):
   `workspaceRowColumns` plus `direction` (`in` / `out`, not null) and the
   opportunistic location stamp (`latitude`, `longitude`,
   `location_accuracy_m`). No worker column — `created_by` is the worker.
   Append-only: no edit path, no update branch on sync.
2. Field screen (`apps/field/src/Span.tsx`): one big button that reads
   *Klok in* or *Klok uit* depending on what this phone punched last, the
   time of that last punch under it, and the offline badge/flush footer the
   other two screens already have. No block picker — a punch is about a
   person and a clock, not a place.
3. `/sync/upload`: one more entry in the per-entity module map
   (`attendance_punches` → `span`), idempotent insert by client uuid,
   held-writes on a suspended or cancelled licence. The route was already
   generalised for this in Phase 3 — this is the first module to arrive
   since and prove it.
4. Eienaar: `GET /eienaar/attendance` — days and hours per person for the
   active season, pairing each `in` with the `out` that follows it. Unclosed
   punches are shown as open, never guessed at.
5. Export: `GET /export/attendance.csv`, one button each in the Farm Admin
   Tool and Eienaar, the same shape as the two exports Phase 4 shipped.

## Deliberately not in this scope

- Enforcement of any kind. The server does not reject a second `in`, and the
  phone does not refuse one. Plan §8's rule — never block a capture over
  configuration — applies to the worker's own mistakes too: the office sees
  what actually happened and fixes it in conversation, not by the phone
  arguing with someone at 05:50.
- A supervisor's roll-call screen, per-team totals, or anything else that
  needs to name a person the device is not assigned to (ADR 0008).
- Overtime rules, rounding, and the public-holiday table. All of that is
  wage arithmetic in disguise, and wages are out for year one.
