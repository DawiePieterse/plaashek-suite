# Span build scope

**Date:** 17 September 2026
**Status:** scope — Phase 5 prep, started ahead of plan §12's own gate ([ADR 0008](decisions/0008-span-prep-early.md))
**Reference app:** none. Unlike `veldnotas` (Notes) and `boord` (Boord /
Boord Owner), there is no existing Span app to audit. This is a fresh build,
scoped from plan §11's one-liner — *"Assigned-person stamp makes clocking
work"* — and §6's placeholder table name, `attendance_punches`.

Nothing here is built yet. Plan §12's Phase 4 gate still applies to actual
implementation (schema, routes, field screen) — this document exists so that
work can start immediately once Bekfontein is live, instead of from zero.

## What Span is

Field attendance: punch in, punch out, stamped with whichever person is
currently assigned to the device — the same `created_by` convention every
other module already uses (plan §6). Span's job stops at recording who was
on the job and when. It does not calculate what they're owed for it: plan
§2.1 is explicit — *"No payments inside Plaashek Management in year one."*

## Straight reuse

| Feature | Source | Verdict |
|---|---|---|
| Device → assigned-person stamp | `device_assignments`, already built (plan §3.2) | Reuse as-is. A punch needs no attribution field of its own beyond `created_by`. |
| Offline save, sync, offline badge | `veldnotas`/`boord`'s field-screen pattern (`apps/field/src/Notes.tsx`, `Harvest.tsx`) | Port the flush-on-mount/`online`/10s-poll effect as-is — same reasoning: a farm punching in has the same rural-signal problem as a farm logging a note. |
| `sync.ts` per-entity module map | Generalised in Phase 3 for `harvest_events` | Add `attendance_punches` as a third entry, same shape. |
| Season stamping | `workspaceRowColumns.seasonId`, resolved on-device | Reuse as-is, though see the open question below on whether a punch is even season-scoped in practice. |

## Conflicts with what's locked in

- **No worker/team attribution beyond the single assigned person** — ADR
  0007's precedent from Boord carries straight over. A device is assigned to
  one person; a punch stamps that one person, not a crew list. A farm that
  wants one phone clocking an entire team in at once needs its own product
  call (same shape as the team-attribution idea ADR 0007 already declined
  once).
- **Append-only, no edit path** (ADR 0006) is the default every module has
  shipped with so far. Span is the first module where that default is
  genuinely uncomfortable — see below.

## Needs a product call before building

| Question | Why it matters |
|---|---|
| Punch in/out as two separate append-only events, or one row whose `punched_out_at` is set later? | Every table shipped so far (`notes`, `harvest_events`) is single-row, append-only, no update (ADR 0006). A row that starts open and is closed later is a mutation — the first of its kind in this schema. Two-events is the ADR-0006-compatible answer (a `punch_in` and a separate `punch_out` row, paired by `device_id` + adjacency) but pushes "was this shift ever closed" logic to query time instead of storage time. |
| Correction model for a forgotten or wrong punch | A worker who forgets to punch out, or punches in twice, needs some resolution path. Straight ADR 0006 (never edit, only append) leaves an open shift dangling forever with no schema-level way to close it. This needs an explicit decision, not a silent carryover of a rule written for a different kind of event. |
| Is a punch season-scoped at all? | `notes`/`harvest_events` are captures *within* a season (a note or a harvest event happened during a pick). A shift can span a season boundary, or a farm may want attendance tracked independent of any season. Confirm before wiring `season_id` in out of habit. |
| Does Span ever need more than one person clocking on one device? | Every module so far free-rides on "one device, one assigned person" (plan §3.2). If a farm wants a shared tablet at the gate that several workers punch on, that's a real change to the device-assignment model, not a Span-specific decision. |

## Recommended v1 build scope (once the above is answered)

1. **Schema** — `attendance_punches`: `workspaceRowColumns` (same as `notes`)
   plus whatever shape the punch-in/punch-out question above settles on. No
   block/camp column unless a farm asks — a punch is a person-day unit, not
   obviously tied to where the work happened.
2. **Field capture screen** — one button, "Klok in" / "Klok uit" depending on
   whether an open punch already exists for this device. No GPS or weather
   stamp: nothing in the plan's one-line spec for Span asks for either, and
   a clock punch doesn't benefit from a location fix the way a field note or
   a harvest weigh-in does.
3. **Sync** — `attendance_punches` added to `sync.ts`'s per-entity module
   map, same idempotent-insert-by-client-uuid shape as `notes` and
   `harvest_events`. Suspended/cancelled licence holds the write, same as
   every other module (plan §5).
4. **Farm Admin Tool** — a read-only list of punches, filtered by whatever
   the season question above decides. No edit/delete unless the correction
   model calls for one.

## Not in this phase

Wages, rates, pay periods (§2.1 explicit non-goal), team/crew clocking on a
shared device (needs its own product call, see above), historical reporting
beyond a plain list — the same "no module polish until it's boring"
discipline every prior phase followed (plan §12).
