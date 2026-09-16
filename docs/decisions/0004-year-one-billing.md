# ADR 0004 — Year-one billing

**Date:** 16 September 2026
**Status:** accepted

## Question

Plan §2.1 names this as a live non-goal, not a settled one: "No payments
inside Plaashek Management in year one **unless §13 Q3 says otherwise**."
§13 Q3.

## Decision

WhatsApp invoice only. No in-app payment in Plaashek Management this year.
The §2.1 non-goal stands as written — this ADR confirms it rather than
overriding it.

A farm's entitlement (`entitlements`, plan §6) is invoiced and reminded over
the WhatsApp Business API — already the planned channel for office notices,
plan §9 — and paid by EFT outside the software. Plaashek staff flip the
entitlement's `status` by hand in Plaashek Management (`active` → `grace` →
`suspended` → `cancelled`, plan §5) once payment is confirmed by whatever
means staff already use to see it clear.

## Why

- Smallest Phase 1 scope. No payment gateway to select or integrate, no
  webhook handling, no recurring-billing logic, no PCI/compliance surface —
  none of that is needed to prove the pairing → capture → sync loop that
  Phase 1's exit criteria actually test.
- The WhatsApp channel this rides on is already a planned Phase 0 line item
  (plan §9), not new infrastructure.
- Manual status flips by staff are exactly what `entitlements.status` and
  `audit_log` (plan §6) already model — an admin action, attributable,
  nothing new to build.
- Revisit once there are enough farms that manual invoice-chasing and manual
  status flips become the actual bottleneck, not before. Building collections
  automation ahead of that need is exactly the kind of premature scope the
  plan's non-goals exist to block.

## Consequences

- `entitlements.source` (plan §6) should record how a farm's entitlement
  came to be active — e.g. `"manual"` for this year's staff-confirmed EFT
  flips — so that if a payment gateway is added later, its rows are
  distinguishable from this year's manual ones without a backfill.
- Plaashek Management needs no payment UI in Phase 1: just the existing
  module on/off + entitlement status controls already in scope (plan §4.1).
- Field workers and farm admins never see billing copy either way (plan §5)
  — this decision doesn't change that rule, WhatsApp invoices go to whoever
  at the farm handles payment, not through the app.
- If a payment gateway is added in a later year, that is a new ADR, not an
  edit to this one — and it should specify how existing `"manual"`-sourced
  entitlement rows are handled, since they won't have gateway metadata.
