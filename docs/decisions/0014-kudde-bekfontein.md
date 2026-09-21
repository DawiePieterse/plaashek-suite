# ADR 0014 — Kudde re-evaluated against Bekfontein's cattle

**Date:** 21 September 2026
**Status:** accepted — re-evaluates [ADR 0005](0005-kudde.md), which named this
exact trigger: *"the day a real farm with livestock is actually under
contract."*

## Question

ADR 0005 deferred Kudde with no build slot and no schema until a real
livestock farm existed to design against, because building it blind risked
inheriting the old reference app's wrong assumptions. Bekfontein — already
the pilot farm for `veldnotas`/`boord`/`eienaar` (ADR 0001) — now runs
cattle: about 100 head, moved between camps for feeding, four bulls kept
mixed in with the cows. Does Kudde get a schema and a build slot now, and
against what shape of data?

## Decision

**Yes — Kudde gets a build slot, scoped to what Bekfontein actually has.**
[docs/kudde-build-scope.md](../kudde-build-scope.md) is the scope, in the
same form Span's and Stoor's build-scope docs took the place of a reuse
audit (neither exists as reference-quality code in this repo — the old
Kudde app stays reference-only per plan §1). It is a fifth licensed module
for Bekfontein, added to `veldnotas`/`boord`/`eienaar` rather than
replacing any of them.

The shape, decided against Bekfontein's specifics rather than guessed:

- **Individual animal identity.** Every animal gets a farm-typed tag number
  (`oormerk` — already plan §8's word for it) the same way ADR 0011 made the
  worker number the farm's own: Plaashek does not mint tags, it records the
  one already in the farm's ear. A bull mixed in with cows still needs his
  own record — averaging him into a headcount loses exactly the fact that
  made the farm mention him.
- **Movement is per-animal, captured in a batch.** A camp move is one field
  action naming a group and a destination camp, but it writes one
  `movements` row per animal in that group — never a herd-level row with no
  per-animal trail. 100 head do not get scanned one at a time to walk them
  to the next camp, but each of them still gets an individual location
  history, because a treatment or a weight recorded later has to land on a
  specific animal in a specific camp, not an estimate.
- **No breeding/mating-group model.** Four bulls mixed with the cows is
  captured as those bulls' ordinary camp movements landing them in the same
  camp as the cows — nothing else. Plaashek does not record which bull
  sired which calf, does not predict calving dates, and does not model a
  breeding season as its own concept. That is a real, larger feature
  (parentage, gestation windows, calving alerts) and nothing about
  Bekfontein's current ask supports guessing its shape yet.
- **Treatments and weights are plain append-only events on an animal**, the
  same shape as every other capture in this suite — no dosing schedule, no
  compliance fields, no derived health status.

## Why

- ADR 0005's blocker was specifically "no real farm, no real tag/movement/
  treatment/weighing patterns to check assumptions against." Bekfontein
  supplies exactly that: a real herd size, a real reason camps get used
  (feeding), and a real fact (bulls mixed in) that would have been invisible
  in a speculative schema and that rules out a herd-only movement model on
  its own.
- Individual-animal identity is not a guess — it falls straight out of
  "four bulls mixed in with the cows" being worth mentioning at all. A
  schema that only tracked camp headcounts could not represent that fact.
- Batching the capture but not the record follows the same pattern the
  piece-work scan already proved (ADR 0009): the phone's interaction can be
  fast (one scan, one screen) while the stored record stays granular
  (one crate, one picker; here, one animal, one movement).
- Breeding is excluded for the same reason ADR 0007/0008 excluded team
  attribution and ADR 0010 excluded wage calculation: it is a real, bigger
  product surface that Bekfontein has not asked for, and building it now
  would be guessing again — the exact failure mode ADR 0005 was written to
  avoid, just one level down inside the module instead of at the
  go/no-go level.

## Consequences

- §11's module order note for Kudde ("Deferred, no build slot — ADR 0005")
  is superseded: Kudde now has a build slot, sequenced into Phase 5 after
  the modules already closed (`span`, seasonal piece-work, `stoor`, `water`,
  `werkswinkel`) per plan §12's "§11 order, each module on the same
  foundation."
- §6's placeholder line (*"kudde — deferred — no schema until a real farm is
  contracted"*) is replaced by real tables: `animals`, `movements`,
  `treatments`, `weights` — see the build scope for exact columns.
- §14's "Kudde spec unvalidated" risk closes, dated to this ADR, not left
  open by design any more — the condition that kept it open (no contracted
  livestock farm) no longer holds.
- If Bekfontein later asks for calving/breeding tracking, that reopens as
  its own ADR against real gestation and calving data, the same way piece-
  work reopened worker attribution (ADR 0009) rather than stretching this
  one.
- No change to Bekfontein's existing entitlements or Phase 4 exit checklist
  — Kudde is new licensed scope, not a substitute for anything Phase 4 still
  needs on `veldnotas`/`boord`/`eienaar`.

## Reference

- [ADR 0005](0005-kudde.md) — the deferral this ADR closes, and the trigger
  condition it named
- [ADR 0001](0001-pilot-farm.md) — Bekfontein as the pilot farm
- [ADR 0009](0009-piecework-picker-attribution.md), [ADR 0011](0011-worker-numbers-are-the-farms.md) —
  the farm-owned-identifier pattern this ADR reuses for the animal tag
- [docs/kudde-build-scope.md](../kudde-build-scope.md) — the resulting scope
