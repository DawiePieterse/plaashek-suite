# ADR 0007 — Boord does not track per-crate worker/team attribution

**Date:** 17 September 2026
**Status:** superseded by [ADR 0009](0009-piecework-picker-attribution.md) —
17 September 2026. The farm asked for seasonal pickers paid per kilogram,
which needs exactly the per-crate attribution refused here. This ADR's own
"Consequences" named that case as the one to revisit it on. Per-crate
attribution now exists, sourced from a scanned printed card rather than an
in-app picker; everything below is kept as the record of why it was refused
while wages were out of scope.

## Question

The Boord + Eienaar reuse audit ([docs/boord-reuse-audit.md](../boord-reuse-audit.md))
found that the reference app stamps every harvested crate with a
`worker_id`, picked mid-shift from a dropdown or QR-card scan on a field
tablet shared by a whole picking team. Plaashek's locked model has no
in-app person picker — every capture is stamped with whichever person the
office assigned to that device (plan §2.1, §3.2). Does `harvest_events`
need its own worker/team fields and picker to match the reference, or does
it stay on the existing device-stamps-the-person model?

## Decision

**No per-crate worker or team attribution.** `harvest_events` gets the same
`created_by` as every other workspace row — the person assigned to the
device at save time (plan §6) — and nothing else about who physically
picked the crate.

## Why

- It directly conflicts with a locked decision, not an unbuilt feature.
  Plan §2.1 is explicit: "No in-app person switching. The admin assigns the
  name; the phone never asks." A shared field tablet with a per-crate
  worker picker is exactly the case that rule rules out.
- The reference app's only real consumer of `worker_id` is wage
  calculation (`RateSetting`, `Payment`, the admin Dashboard's wage
  columns) — and "no payments inside Plaashek Management in year one" is
  an explicit non-goal (§2.1). The data would have nowhere to go once
  captured.
- The reference's admin-correction endpoint (`edited_at`/`edited_by` on
  `HarvestRecord`) exists specifically to keep `worker_id`/`weight_kg`
  accurate for wages after a mis-scan. Without wage tracking, that reason
  disappears too — one less thing to build, on top of one less thing to
  decide (crates stay append-only per plan §7 and ADR 0006's precedent,
  with no separate ADR needed for that half).

## Consequences

- `harvest_events` needs no `worker_id`/`team_id` columns and the field
  capture screen needs no worker picker — block + weight + deduction is
  the whole form, same shape as `Notes.tsx`.
- No per-picker productivity data exists yet. If a farm asks for "who
  picked what" without payroll attached, that is a real ask worth its own
  decision when it comes — this ADR closes the wage-attribution case, not
  every future reason a farm might want a worker field.
- If Plaashek ever does build in-farm payments or per-picker recognition,
  this is the ADR to revisit — likely paired with whatever ADR eventually
  reverses the "no in-app person picker" non-goal, since one alone doesn't
  solve the problem the reference app solved.

## Reference

- [docs/boord-reuse-audit.md](../boord-reuse-audit.md) — raised the question
- Plan §2.1 (non-goals), §3.2 (attribution), §6 (data model)
- [ADR 0006](0006-note-corrections.md) — the append-only precedent this
  reuses for crates
