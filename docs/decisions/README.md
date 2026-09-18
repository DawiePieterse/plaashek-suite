# Decisions

One file per Phase 0 answer, and per significant call after that. Numbered,
never deleted — a superseded decision gets a status line pointing at the one
that replaced it.

Open questions waiting for an ADR (plan §13):

1. ~~First pilot farm, and which two field modules they carry~~ — [ADR 0001](0001-pilot-farm.md)
2. ~~Minimum Android version — Dexie vs SQLite/OPFS~~ — closed as a side effect of [ADR 0002](0002-sync-engine.md) (PowerSync embeds SQLite/OPFS)
3. ~~Year-one billing — invoice on WhatsApp, or pay inside Plaashek Management~~ — [ADR 0004](0004-year-one-billing.md): WhatsApp invoice only, confirming the §2.1 non-goal
4. ~~Kudde — real livestock model, or speculative~~ — [ADR 0005](0005-kudde.md): speculative, deferred with no build slot until a real livestock farm is under contract
5. ~~The three offline windows — ticket life, revoke reach, licence grace~~ — [ADR 0003](0003-offline-windows.md): 21 / 21 / 14 days, confirmed as proposed
6. ~~Sync engine — build or buy~~ — [ADR 0002](0002-sync-engine.md): buy (PowerSync, self-hosted)
7. ~~Pilot farm's pick dates, so Phase 3 and 4 miss the season~~ — [ADR 0001](0001-pilot-farm.md)'s updates: originally no 2026 rollout, Phase 4 go-live 2027 (Jan-Aug window); both gates removed 17 September 2026 — go-live has no calendar restriction now

Raised outside §13, during phase work:

8. ~~Veldnotas: how a worker corrects a wrong note, given `notes` was already built append-only~~ — [ADR 0006](0006-note-corrections.md): no edit, no delete — a correction is a new note
9. ~~Boord: per-crate worker/team attribution, or the existing device-stamps-the-person model~~ — [ADR 0007](0007-boord-no-worker-attribution.md): no per-crate attribution, same as every other module — **superseded by [ADR 0009](0009-piecework-picker-attribution.md)** once the farm asked for per-kg pay
10. ~~Span: one supervisor clocking a team, or the device's assigned person clocking themselves~~ — [ADR 0008](0008-span-self-clocking.md): the assigned person, no picker — the same call as ADR 0007, and the second module to hit that wall
11. ~~Seasonal pickers paid per kg: how a crate is tied to the picker, given §2.1 rules out an in-app person picker~~ — [ADR 0009](0009-piecework-picker-attribution.md): a printed worker card, scanned at the scale. §2.1 narrowed to "identity comes from scanned paper, never a list on the phone"; ADR 0007 superseded
12. ~~How far Plaashek goes into paying those pickers~~ — [ADR 0010](0010-piecework-pay-boundary.md): calculates kg and rand and exports them; no payslips, no payment, and explicitly no minimum-wage compliance claim
