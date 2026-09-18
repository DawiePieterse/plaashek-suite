# Piece-work build scope — seasonal pickers paid per kilogram

**Date:** 17 September 2026
**Status:** scope — Phase 5, raised by the farm outside §11's module order
**Reference app:** Boord's field harvest capture, partially. The reference
stamps every crate with a `worker_id` picked from a dropdown or a scanned
worker card and prices it for wages — the exact feature
[docs/boord-reuse-audit.md](boord-reuse-audit.md) ruled out and
[ADR 0007](decisions/0007-boord-no-worker-attribution.md) closed. The farm has
now asked for it, so that decision is reopened and superseded, not
worked around.

## What the farm asked for

Span (Phase 5's first module) turned out to be for **permanent employees**:
one person, one paired phone, one clock. The litchi pick is the other half of
the farm's labour and works nothing like that — a seasonal team, transient,
no phone each, **paid per kilogram picked**. The office needs to register
those pickers, pay them by weight, and hand the numbers to whoever runs
payroll.

## The three locked decisions this reopens

| Locked | What happens to it |
|---|---|
| §2.1 "No in-app person switching. The admin assigns the name; the phone never asks" | **Narrowed, not dropped** — [ADR 0009](decisions/0009-piecework-picker-attribution.md). The phone still never asks *who are you*. It reads a printed worker card, which is the same mechanism the suite already uses for pairing: paper is the credential. No list of names on the phone. |
| [ADR 0007](decisions/0007-boord-no-worker-attribution.md) "no per-crate worker attribution" | **Superseded by ADR 0009.** Its own text named this case: revisit when in-farm payments or per-picker recognition arrive. They have. |
| Wages as a non-goal (the boord audit's reading of §2.1) | **Split** — [ADR 0010](decisions/0010-piecework-pay-boundary.md). Calculating what a picker earned is in. Payslips and moving money are out. |

## Decisions taken with the farm, 17 September 2026

| Question | Call |
|---|---|
| How a crate is tied to a picker | A **printed worker card**, scanned at the scale by the supervisor's phone before the weight is entered. Cards are printed from the office, one per seasonal worker. |
| What is on the card | **The farm's own worker number**, typed by the office — the QR holds that and nothing else ([ADR 0011](decisions/0011-worker-numbers-are-the-farms.md), 18 September 2026). It is the key the farm's payment system already uses, so the export joins to their payroll without a mapping table. |
| Keeping the register straight | The office **edits** a worker's number, name or standing in place, and **imports and exports** the whole list as CSV keyed on the number. An import updates numbers the farm already has and adds new ones; it never deletes. |
| Rate model | **Tiered**: a base rate per kg up to a daily target, a higher rate per kg above it. Effective-dated, so a mid-season rate change never rewrites what last week already earned. |
| How far the money goes | **Totals and CSV out.** Kilograms and rand per picker per period, on screen and as a CSV for whoever runs payroll. No payslips, no payment execution. |
| Where it lives | **Boord's existing capture, extended**, plus a new section in the Farm Admin Tool. No new module code, no second weighing, no parallel harvest table. |

## Build scope

1. **Schema**
   - `people.worker_number` (unique per farm) and `people.active`. The number
     is the farm's own, typed by the office (ADR 0011); `active` is how a
     worker who has left stops collecting crates. There is no card table:
     with the farm's number on the paper there is nothing separate to issue
     or revoke, and reprinting a lost card prints the same number.
   - `piece_rates`: `farm_id`, `season_id`, `effective_from`, and the tier in
     integer cents — `base_cents_per_kg`, `target_kg`, `bonus_cents_per_kg`.
     Effective-dated history, never edited in place.
   - `harvest_events.picker_id` (nullable FK to `people`) and
     `harvest_events.picker_card_code` (what was actually scanned). Both
     nullable: a farm running Boord without piece-work is unchanged, and a
     crate whose card could not be resolved is still a crate.
2. **The card at the scale** (`apps/field/src/Harvest.tsx`): scan the card,
   then weigh. `BarcodeDetector` where the phone has it, and a typed
   short-code fallback where it does not — the code is printed on the card in
   readable characters for exactly that case. The card list is cached on the
   device the same way blocks are, so scanning resolves **offline**.
3. **Never blocked by an unknown card.** A card issued this morning is not in
   last night's cached list. The phone saves the crate with the raw scanned
   code and no picker; the server resolves the code at sync; anything still
   unresolved shows in the office as a crate needing a picker. Plan §8's rule
   holds — the scale queue does not wait for configuration.
4. **Office** (Farm Admin Tool, new section):
   - register seasonal workers under the farm's own number, and edit that
     number, the name or their standing later,
   - print a card for any worker,
   - import and export the register as CSV, keyed on the worker number, so
     the payment system's list and this one stay the same list,
   - set the tiered rate for the season,
   - payout table: kg and rand per picker for a period, with the unresolved
     count visible.
5. **Export**: `GET /export/piecework.csv` — per picker per day, kg and cents,
   in both office tools. This is the file payroll actually uses.

## Deliberately not in this scope

- **Payslips and payment.** ADR 0010. Plaashek reports what was picked and
  what the farm's own rate makes that worth; it is not a payroll system and
  does not move money.
- **Minimum-wage checking.** South Africa's agricultural sectoral minimum is
  an hourly floor, and a piece rate has to clear it for the hours actually
  worked. Plaashek cannot check that here: Span (the only thing that records
  hours) is for permanent staff, so no hours exist for a seasonal picker.
  Say this plainly to the farm rather than letting a rand total imply a
  compliance blessing it is not. If the farm wants the check, the honest
  version is clocking the seasonal team too — a real piece of work, and its
  own decision.
- **Per-picker quality or rejection tracking beyond the existing
  `deduction_kg`.** Pay is on net kg (weight minus deduction). Grading a
  picker's fruit is a different feature.
- **Teams, gang bosses, or splitting a crate between pickers.** One crate,
  one card, one picker. If two people fill a crate the farm scans one card —
  the same simplification the reference app made.
