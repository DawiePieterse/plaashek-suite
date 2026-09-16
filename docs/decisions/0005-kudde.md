# ADR 0005 — Kudde: real livestock model, or speculative

**Date:** 16 September 2026
**Status:** accepted

## Question

Plan §11 lists Kudde as "Port vs new — §13 Q4," and the risks table (§14)
names an unvalidated spec as a live risk: "New requirements until Q4 is
answered." §13 Q4.

## Decision

Kudde stays **speculative and deferred**. No livestock farm is lined up —
[ADR 0001](0001-pilot-farm.md) confirms the pilot (Bekfontein) carries only
`veldnotas`, `boord`, `eienaar`, and that no real data exists yet for any
module. Building Kudde now would mean building against the old reference
app's assumptions with nothing real to check them against.

Kudde does not get a Phase 1–4 build slot. It stays plan §11's reference
app only. Revisit this ADR — not the plan's module order — the day a real
farm with livestock is actually under contract.

## Why

- The old Kudde app is reference-only (plan §1): "Reuse a screen or a data
  shape if it drops into this architecture. Otherwise rebuild." That
  license to rebuild is only worth exercising against real animals, real
  tag/movement/treatment patterns, real weighing cadence — none of which
  exist yet.
- Porting the old model as-is trades a smaller near-term decision (skip
  validation) for a larger later one (unwind a wrong data model once real
  livestock data shows the old assumptions don't hold). §14 already flags
  this as the risk; deferring is how the risk is absorbed, not resolved by
  guessing.
- Nothing else in Phase 0–4 depends on Kudde. §11's module order already
  sequences it after `span` and `stoor`, and §12 Phase 5 already says
  "Re-evaluate Kudde after Q4" — this ADR is that re-evaluation trigger,
  not a commitment to build.

## Consequences

- §11's module order is unchanged: Kudde stays position 6, behind `span`
  and `stoor`.
- No Kudde schema (`animals`, `movements`, `treatments`, `weights` — plan
  §6) gets designed until a real farm is contracted. Building it blind now
  would risk the same rework the old app is being retired to avoid.
- Sales conversations that raise Kudde should surface a livestock lead
  back into this decision, not into a build ticket. When a real farm
  exists, open a new ADR (0006+) to size the module against that farm's
  actual data rather than editing this one — this ADR's job was to name
  "no farm yet" as the blocker, and it stays true until that changes.
- Plan §14's "Kudde spec unvalidated" risk stays open and undated by
  design — it closes only when a real farm is under contract, not on a
  calendar date.

## Reference

- Plan §11 (module order and reuse), §13 Q4, §14 (risks)
- [ADR 0001](0001-pilot-farm.md) — confirms no real data exists yet, Kudde
  deferred pending this ADR
