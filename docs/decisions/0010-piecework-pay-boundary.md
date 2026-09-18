# ADR 0010 — Plaashek calculates piece-work pay; it does not pay anyone

**Date:** 17 September 2026
**Status:** accepted

## Question

Once a crate is attributed to a picker ([ADR 0009](0009-piecework-picker-attribution.md)),
the farm wants what that picker earned. The boord reuse audit read plan
§2.1's "no payments inside Plaashek Management in year one" as ruling wages
out entirely. That reading is now in the way of a real request. Where
exactly does Plaashek stop: at kilograms, at rand, at payslips, or at
paying?

## Decision

**Plaashek stops at rand, per picker, per period, on screen and in a CSV.**

In scope: a tiered rate the farm sets (base cents per kg up to a daily
target, a higher rate above it), effective-dated; a payout view; an export.

Out of scope: payslips, pay periods as stored objects, deductions of any
kind, tax, UIF, and any movement of money.

## Why

- §2.1's non-goal is about **Plaashek being paid by the farm** — that is what
  "payments inside Plaashek Management" means, and [ADR 0004](0004-year-one-billing.md)
  settled it as a WhatsApp invoice. The farm paying its own workers is a
  different question that was never actually decided; the audit's broader
  reading was a reasonable caution, not a ruling. Say that plainly rather
  than pretending to reverse something.
- Kilograms without rand would not answer the request. The farm's question
  is "what do I owe this picker", and a tool that makes them re-key weights
  into a spreadsheet to find out has not removed the paper step.
- Rand with payslips **would** answer more than was asked, and costs much
  more: a payslip is a statutory document. Issuing one makes Plaashek the
  record of what someone was paid, which pulls in pay periods, corrections,
  retention and disputes. None of that is a litchi problem.
- Moving money is a different company. Banking integration, KYC, failed
  payments and reconciliation — all to save one CSV hand-off.

## Consequences

- Money is stored and calculated in **integer cents**, never floating point,
  and rates are effective-dated so a mid-season change cannot silently
  restate last week.
- The calculation is derived at read time from the crates and the rate that
  was in force — nothing is snapshotted. A late-syncing phone changes the
  answer, which is correct, and means the CSV must be re-pulled after a late
  sync rather than trusted from yesterday.
- **Plaashek does not check minimum-wage compliance and must not appear to.**
  South Africa's agricultural minimum is hourly, and a piece rate must clear
  it for hours actually worked. No hours exist for a seasonal picker — Span
  is permanent staff only ([ADR 0008](0008-span-self-clocking.md)) — so the
  tool has nothing to check against. A rand total is what the farm's own
  rate produced, not a statement that it is lawful. This belongs in the
  order form and in the screen's own wording, not only in this ADR.
- If the farm later wants that check, the honest path is clocking the
  seasonal team as well, then comparing earned rand against hours × the
  floor. That is a real build and its own decision.
- Nothing here stops a future payslip or payment feature; it just says
  neither is hiding inside this one.

## Reference

- [docs/piecework-build-scope.md](../piecework-build-scope.md) — the request
- Plan §2.1 (non-goals), §10 (offboarding and export)
- [ADR 0004](0004-year-one-billing.md) — what §2.1's payments non-goal actually covers
- [ADR 0009](0009-piecework-picker-attribution.md) — where the attribution comes from
