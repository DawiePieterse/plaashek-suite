# ADR 0003 — The three offline windows

**Date:** 16 September 2026
**Status:** accepted

## Question

Plan §3.6 names three separate numbers, easy to conflate, all needed before
Phase 1 code: ticket life, revoke reach, licence grace. §13 Q5.

## Decision

Confirmed as proposed in plan §3.6:

| Window | What it controls | Value |
|---|---|---|
| **Ticket life** | How long a device keeps working with no successful sync at all | 21 days, then read-only — "Gaan na die hek vir sein" |
| **Revoke reach** | How long a revoked phone keeps working before its next sync kills it | Same 21 days — it is the same mechanism |
| **Licence grace** | How long after a farm's licence lapses the apps keep capturing | 14 days (plan §5) |

Not part of this ADR: the pairing QR token life (48 hours, already locked
in plan §3.4) — that governs an unscanned slip, not a paired device, and is
a different number for a different risk.

## Why

- 21 days covers an occasional dead zone without being so long that a lost
  phone or a missed revoke goes unnoticed for a full season.
- Revoke reach is deliberately not a separate, shorter mechanism. Plan §3.6
  says it plainly: revoke is immediate at the server; on the handset it lands
  at next contact. Building a second, faster revoke channel (e.g. a push-based
  kill switch) would need connectivity the field phones don't reliably have —
  it would only work in the cases where the 21-day window was already fine.
  Not worth the added Phase 1 build for the cases it would actually help.
- 14 days of licence grace matches plan §5: never brick a farm mid-pick over
  a late invoice, but also don't let unpaid use run indefinitely.
- No Bekfontein-specific signal-coverage data exists yet to justify departing
  from the plan's defaults. If picking crews turn out to work areas with
  multi-week dead zones during the Sep–Dec peak, revisit before Phase 4
  go-live. ADR 0001's calendar gate (Jan–Aug 2027) was removed 17 September
  2026 — go-live can now land inside the Sep–Dec peak itself, so this is no
  longer a "gather the data whenever, there's time" item. Confirm signal
  coverage against these defaults as part of the Phase 4 exit checklist's
  on-site offline-day proof, not after.

## Consequences

- `packages/tickets` mints device tickets with a 21-day validity, and the
  same value governs how long a revoked ticket keeps being accepted before
  a sync rejects it.
- Entitlement rows (`farms` × module, plan §6) carry `grace_days = 14` as
  the default; nothing in this ADR makes it per-farm-configurable — that
  would be new scope, not part of closing Q5.
- The Phase 1 exit checklist (plan §12) test "licence flipped to `suspended`
  → captures inside grace land in the holding area" uses 14 days as the
  concrete number to test against.
- If Bekfontein's actual coverage forces a change, that is a new ADR
  superseding this one, not an edit to it.
