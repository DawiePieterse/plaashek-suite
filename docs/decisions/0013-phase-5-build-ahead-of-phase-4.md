# ADR 0013 — Phase 5 build proceeds ahead of Phase 4's close

**Date:** 18 September 2026
**Status:** accepted
**Supersedes:** [ADR 0012](0012-span-prep-early.md)

## Question

ADR 0012 authorized Span *scoping* ahead of Bekfontein's Phase 4 checklist
closing, and was explicit that it did not authorize implementation: *"does
not... authorize writing `attendance_punches` migrations or field-capture
code. Plan §12's gate still applies to actual implementation — only the
scoping step moved earlier."*

The very next session went ahead and built Span in full — schema,
migrations, field capture screen, sync routing, office rollup, CSV export
(ADR 0008–0011, `docs/span-build-scope.md`) — and added Piecework alongside
it, none of which ADR 0012 authorized. That work merged into `main` as
[PR #2](https://github.com/DawiePieterse/plaashek-suite/pull/2) with Phase 4
still open. Does that stand, or does the code get held back until Phase 4
closes?

## Decision

It stands. Phase 5 build work — Span and Piecework now, whatever comes next
in §11's order — proceeds in parallel with Phase 4's remaining checklist
rather than waiting on it. This is a deliberate, explicit amendment to plan
§12's rule ("No Span... work starts before this closes"), not a lapse that
happened to go unnoticed.

## Why

- Plan §12's remaining Phase 4 items are exclusively on-site work at
  Bekfontein: real people/blocks/camps entered, real device pairing, an
  offline-day proof, days-since-sync against real signal, a revoke on a real
  device, the backup/restore drill against real data, a go-live date. None
  of them are code. Holding Phase 5 code back does not move any of those
  items forward — it just leaves engineering time idle while the pilot
  waits on farm-side access.
- The rule §12 states exists to stop *module polish from delaying go-live*
  (plan §14: "Pilot delayed for another module → Phase 4 before Span /
  Stoor / Kudde"). Building Span and Piecework does not touch Bekfontein,
  does not license either module for any farm, and does not compete for the
  same time as the on-site checklist items above — so it does not carry the
  risk the rule was written against.
- The code itself was verified independently of this decision: 97/97 tests
  green, clean typecheck, migrations apply cleanly, on top of current `main`
  (see PR #2's description).

## Consequences

- Plan §12's Phase 4 section is read as: the checklist still gates
  Bekfontein's actual go-live, but it no longer gates Phase 5 *build* work.
  Phase 5's own module checklists (§12) track when each module is actually
  done, same as any other phase.
- ADR 0012's restriction — scoping only, no implementation — is retired. Its
  file stays as the historical record of what was decided at the time.
- This does not retroactively bless skipping ahead on process for its own
  sake. Each future Phase 5 module still needs its own scope/reuse-audit
  step and, where it touches a locked decision (§2.1's non-goals, the
  append-only default, the no-picker rule), its own ADR — same discipline
  every module through Boord and Span already followed. What changes is
  only the calendar gate this rule imposed relative to Phase 4's close.
- If a future Phase 5 module's build turns out to need something Bekfontein
  itself would have surfaced first (a real farm's actual data shape,
  real-world offline behaviour), that is a reason to reopen this decision
  for that module specifically, not a reason it should have been avoided
  here.
