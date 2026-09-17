# ADR 0008 — Start Span prep before Bekfontein is live

**Date:** 17 September 2026
**Status:** accepted

## Question

Plan §12 says explicitly: *"No Span, Stoor, Water, Werkswinkel, Oudit, or
Kudde work starts before [Phase 4] closes."* Bekfontein's real people, blocks,
camps, on-site device pairing, offline-day proof and backup drill are all
still open (plan §12 Phase 4). Should Span scoping start anyway?

## Decision

Yes — explicit product decision to override the Phase-4 gate for *scoping
only*. Start Span's build scope now (`docs/span-scope.md`).

## Why

The rule exists to stop module polish from delaying the pilot's actual
go-live (plan §14: "Pilot delayed for another module → Phase 4 before Span /
Stoor / Kudde"). A scoping document — no schema migration, no entitlement
change, no code shipped, nothing that touches Bekfontein — doesn't carry
that risk. It's the same kind of prep work the veldnotas and boord reuse
audits did ahead of their phases, just started earlier in the calendar than
the plan assumed.

## Consequences

- Span's build scope exists once someone has time to act on it, instead of
  starting from zero after Bekfontein goes live.
- This does **not** reopen Phase 4's exit criteria, license Span for any
  farm, or authorize writing `attendance_punches` migrations or field-capture
  code. Plan §12's gate still applies to actual implementation — only the
  scoping step moved earlier.
- If Span scoping surfaces a schema or workspace-model change (see the open
  product-call questions in `docs/span-scope.md`), that decision still waits
  for its own ADR before any code lands, same as every prior module.
