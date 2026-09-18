# ADR 0014 — Water and Werkswinkel built ahead of Stoor

**Date:** 18 September 2026
**Status:** accepted

## Question

Plan §11's module order, and §12's "next, not started" note under Phase 5,
both put `stoor` before `water` and `werkswinkel`. No build scope for
`stoor` exists yet. The instruction for this session named `water` and
`werkswinkel` specifically. Build those two out of order, or write `stoor`'s
scope first to keep §11's sequence?

## Decision

Build `water` and `werkswinkel` now, out of §11's stated order. `stoor`
stays next in the written order but is not started by this change.

## Why

- §11's order was reuse-driven, not risk-driven: Veldnotas, Boord and
  Eienaar had reference apps to mine; Span had none and still went first in
  Phase 5 because the farm asked for clocking. Nothing about `stoor`'s
  position makes it a dependency for `water` or `werkswinkel` — the three
  don't share a table, a workflow, or a locked decision the others need
  resolved first.
- ADR 0013 already established that Phase 5 build order is not a rigid
  queue but a backlog worked as the farm's needs and the available time
  line up — that is what let Span and piece-work jump ahead of Phase 4's
  close in the first place. The same reasoning applies one level down,
  inside Phase 5 itself: there is no standing rule that `stoor` must be
  scoped before `water` or `werkswinkel` can be, only that it was written
  down first.
- `stoor` is explicitly called out in §12 as carrying more legal weight
  (chemical and stock records) than the rest of Phase 5, which is a reason
  to give its scope more care, not to block unrelated modules behind it.
- Both `water` and `werkswinkel` turn out to be the simplest remaining
  modules — no season stamp (§6 already names them the season-less pair),
  no new office rollup shape beyond what Span and Boord's eienaar routes
  already established, and both read from the `assets` master-data table
  that already exists in the schema and the demo seed, just without a
  create endpoint yet. Building them together lets that one gap (asset
  create/list) get closed once for both instead of twice.

## Consequences

- §12's Phase 5 section gets its own checklist entries for `water` and
  `werkswinkel`, closed the same way Span's was, with `stoor` left as
  "next, not started" exactly as it already reads.
- `stoor` still needs its own build scope before any code — this ADR does
  not pre-approve its shape, only explains why it was not written first.
- The `assets` table gains a farm-facing create endpoint
  (`POST /assets`) and a device-facing list endpoint (`GET /assets`,
  mirroring `GET /blocks`) as part of this work, becoming real master data
  the Farm Admin Tool can grow rather than seed-script-only rows. `stoor`
  can reuse both when its own scope is written.
- Both modules follow Span's "no enforcement" precedent
  (`docs/span-build-scope.md`) rather than inventing a new one: a phone
  never refuses a capture based on what it thinks the current state is
  (an asset already reading X, a work order already open), because a
  reliably current cross-device state would need a live fetch the plan's
  offline-first rule (§8) does not allow blocking a save on.
