# ADR 0008 — Span clocks the device's assigned person, not a team

**Date:** 17 September 2026
**Status:** accepted

## Question

Span is clocking (plan §11 order 4, [docs/span-build-scope.md](../span-build-scope.md)).
The way most farms actually run a register, one supervisor walks the line
with one phone and marks everyone present — which needs the phone to ask
"who?", the in-app person picker plan §2.1 rules out. Does Span get an
exception, or does a punch belong to the device's assigned person like
every other capture in the suite?

## Decision

**A punch belongs to the device's assigned person.** `attendance_punches`
carries `direction` and the standard `created_by` stamp (plan §6) and
nothing else about who was clocked. One phone clocks one person — itself.
No picker, no roll-call screen, no team punch.

## Why

- Plan §11's own justification for Span says so: *"Assigned-person stamp
  makes clocking work."* Span is scheduled where it is because the stamp
  already exists, not because a new attribution model was planned for it.
- §2.1 is a locked non-goal, and ADR 0007 refused the same exception for
  Boord three phases ago on the same grounds. Granting it here would settle
  the picker question by accident, in a module, rather than deliberately —
  and it would make Boord's refusal look arbitrary rather than principled.
- The picker is the smaller half of the problem anyway. A supervisor marking
  a team present is asserting something about other people, which is
  attendance *evidence* of a different quality from a person's own punch —
  it wants a supervisor identity, an "on behalf of" field, and a rule about
  who may assert what. That is a real feature with a real design, not a
  dropdown.
- Devices are free and uncapped (§2, §1). "A phone per person who clocks"
  is expensive in handsets but it is not expensive in licence, and it is the
  only shape that fits year one without reopening a locked decision.

## Consequences

- Span is only useful to a farm whose clocking people each carry a paired
  phone — a permanent staff farm, not a 40-picker seasonal team sharing one
  tablet. Say that plainly when selling it rather than discovering it
  on-site. **Confirmed by the farm on 17 September 2026:** Span is for
  permanent employees, and seasonal piece-workers paid per kilogram are a
  separate build. That build is the third case to hit the no-person-picker
  wall, so it reopens §2.1 properly rather than deciding it inside a module
  — see the closing note below.
- `attendance_punches` needs no `worker_id`, no `marked_by`, and the field
  screen is one button. Hours are derived office-side from the punch pairs,
  so nothing about this decision is baked into stored data.
- If this is reversed, the table gains a subject column distinct from
  `created_by` and the existing rows keep working: today's punches are
  exactly the case where subject equals `created_by`. The reversal is a
  migration plus a picker, not a rewrite — which is the main reason it is
  safe to decide the narrow way now.
- This is the second module to hit the no-person-picker wall (ADR 0007 was
  the first). A third is the signal to stop deciding it per module and
  reopen §2.1 properly.

## Reference

- [docs/span-build-scope.md](../span-build-scope.md) — raised the question
- Plan §2.1 (non-goals), §3.2 (attribution), §6 (data model), §11 (module order)
- [ADR 0007](0007-boord-no-worker-attribution.md) — the same wall, in Boord
- [ADR 0006](0006-note-corrections.md) — the append-only precedent punches reuse
