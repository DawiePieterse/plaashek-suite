# ADR 0001 — Pilot farm and modules

**Date:** 16 September 2026
**Status:** accepted

## Question

Which farm pilots the suite first, and with which modules?

## Decision

Laughing Waters / Bekfontein. Phase 1–3 target `veldnotas`, `boord`, and `eienaar`
(seeded from Boord Owner). Kudde and Notes exist as reference apps but are not
part of the pilot's first licensed set — Notes' logic feeds `veldnotas`, Kudde
is deferred pending ADR 0002.

No real data exists yet. The four existing apps were built for this farm but
never used on it operationally — the pilot is a genuine first real deployment,
not a migration.

## Why

Boord Owner only makes sense once Boord is live, which is why `eienaar` builds
alongside `boord` rather than before it — matches plan §5, §12 Phase 3.

## Consequences

Phase 4's exit criteria (plan §12) are validated against this farm specifically.
Season dates for Bekfontein's litchi harvest need to be mapped against Phase 3/4
scheduling so field capture work doesn't land mid-pick.

## Update — 16 September 2026

Peak picking within the season: 1 Sep – 31 Dec.

Risk: phase estimates in plan §12, started today, land Phase 3 (Boord build)
in Nov-Dec — inside peak picking. Phase 3 itself is safe (built and tested
against the fake farm, no real Bekfontein data touched). Phase 4 (real farm
go-live) is the one that matters — do not go live with Bekfontein's actual
harvest capture during 1 Sep - 31 Dec, regardless of how early Phase 3
finishes.

Decision: target Phase 4 go-live for Jan 2027 onward, even if Phase 1-3
complete earlier. Use any spare time before Jan either hardening the build
or starting Phase 5's next module, not pushing Phase 4 early.

Revised safe window for Phase 4 go-live: Jan - Aug 2027.

## Update — 16 September 2026 (rollout year confirmed)

Business decision, independent of the season-risk analysis above: there is
no rollout in 2026 at all. Phase 4 go-live is 2027, full stop — not "as
early as Jan 2027 if Phase 1-3 finish early," but "not this year, regardless
of build progress."

This closes plan §13 Q7. It doesn't change the Jan-Aug 2027 safe window
above (that window was already inside 2027), but it removes any reading of
"even if Phase 1-3 complete earlier" as license to go live in late 2026 —
that phrase only ever meant "don't rush Phase 4 itself," and did not
contemplate a 2026 date. There is no 2026 go-live under any build-speed
scenario.
