# ADR 0006 — Correcting a wrong veldnotas note

**Date:** 17 September 2026
**Status:** accepted

## Question

The veldnotas reuse audit ([docs/veldnotas-reuse-audit.md](../veldnotas-reuse-audit.md))
found that the reference app (BoordNotes) supports in-place edit and
soft-delete/archive of a note, but `notes` was already built append-only in
Phase 1 — `onConflictDoNothing` insert, no update path
(`services/api/src/routes/sync.ts`). How does a worker fix a mistake?

## Decision

**No edit, no delete.** A wrong or incomplete note is corrected by capturing
a new note, same as any other field event. Nothing supersedes or hides the
old one; the office reads both and judges which is current, same as two
edits to the same animal tag (plan §7).

## Why

- This is what Phase 1 already built, not a new mechanism — `applyNote` has
  no update branch and the insert is conflict-safe by id only. Formalizing
  it costs nothing; reversing it costs a schema change and an update code
  path.
- Matches plan §7 directly: "append-only for events (crates, treatments,
  punches, notes)... two edits to the same animal tag: keep both, flag the
  office." Notes are already named as one of those events.
- §10 flags Stoor's chemical records as carrying legal weight. The same
  instinct applies here: a note is what was observed at that place and time.
  Letting it be silently rewritten or hidden later is the wrong default for
  farm records generally, not just the ones with obvious legal exposure.
- An edit window or a `supersedes` pointer (the audit's options b and c) both
  need new schema, new UI state, and a rule for when editing stops being
  allowed. Nothing in the Phase 2 exit bar (plan §12: "offline note survives;
  farm without the entitlement cannot pair") asks for either.

## Consequences

- `Notes.tsx` stays capture-only. No edit screen, no archive action — the
  Phase 2 build in the reuse audit's scope list is unaffected.
- A note the office needs to correct or retract lives on. If that becomes a
  real problem (not a hypothetical one), the fix is a new note that says so
  in the body, not a UI feature — revisit only if a farm actually asks for
  removal, and open a new ADR rather than reopening this one.
- Tags and photos (deferred by the reuse audit) inherit the same rule
  without needing their own decision: whatever gets built for them is
  append-only too.

## Reference

- [docs/veldnotas-reuse-audit.md](../veldnotas-reuse-audit.md) — raised the question
- Plan §7 (sync/conflicts), §10 (backup/offboarding, Stoor's legal weight)
- `services/api/src/routes/sync.ts` — the code this ADR formalizes
