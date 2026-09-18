# ADR 0009 — A scanned printed card attributes a crate to its picker

**Date:** 17 September 2026
**Status:** accepted — supersedes [ADR 0007](0007-boord-no-worker-attribution.md);
amended by [ADR 0011](0011-worker-numbers-are-the-farms.md) 18 September 2026.
The scan and the printed card stand. What changed: the code on the card is
the farm's own worker number, typed by the office, not a random code we
generate — so the card lifecycle described below (issue, reissue, revoke)
no longer exists, and the guessability trade-off is stated in ADR 0011.

## Question

The farm pays its seasonal litchi pickers per kilogram
([docs/piecework-build-scope.md](../piecework-build-scope.md)). That requires
knowing which picker filled each crate — the per-crate attribution
[ADR 0007](0007-boord-no-worker-attribution.md) refused, on the grounds that
it needs the in-app person picker plan §2.1 rules out and that its only
consumer was wages, a non-goal. Both grounds have now changed. How does a
crate get tied to a picker without simply deleting a locked decision?

## Decision

**A printed worker card, scanned at the scale.** Each seasonal worker gets a
card printed from the Farm Admin Tool carrying a QR code and the same code in
readable characters. At the scale the supervisor's phone scans the card, then
enters the weight. `harvest_events` gains `picker_id` (resolved from the
card) and `picker_card_code` (what was scanned).

ADR 0007 is superseded: per-crate attribution exists. Plan §2.1's rule is
**narrowed, not dropped** — the phone still never shows a list of people and
never asks the worker to identify themselves. It reads paper.

## Why

- **Paper as the credential is already this suite's model.** A phone learns
  its farm and its app by scanning a printed slip (§3.4); a device is
  identified by what it was handed, never by someone choosing from a list.
  A worker card is the same idea applied to a person. That is a real
  distinction, not a loophole: a dropdown of 40 names is a decision made on
  the phone, and a scan is a fact presented to it.
- **§2.1's actual reasons survive it.** That rule exists so a shared phone
  cannot silently misattribute work and so nobody is asked to pick a name
  mid-shift with gloves on. A card scan is faster than a list, harder to get
  wrong by a mis-tap, and leaves the scanned code on the record so a wrong
  attribution is visible afterwards rather than invisible.
- **ADR 0007 asked to be revisited in exactly this case** — "if Plaashek ever
  does build in-farm payments or per-picker recognition, this is the ADR to
  revisit." It also predicted this would be paired with reopening the picker
  rule, which is what this ADR does.
- **[ADR 0008](0008-span-self-clocking.md) set the trigger.** It said a third
  module hitting the no-picker wall should reopen §2.1 properly rather than
  decide it a fourth time inside a module. This is that reopening, and it
  produces a general rule — *identity comes from scanned paper, never from a
  list on the phone* — rather than another local exception.
- **The alternative costs more than it saves.** A phone per picker (Span's
  model) does not survive a 40-person seasonal team, and an office-typed
  paper tally reintroduces the paper step the whole suite exists to remove.

## Consequences

- `harvest_events` carries two new nullable columns. Nullable is deliberate:
  a farm running Boord without piece-work is unchanged, and an unresolvable
  card never blocks a crate.
- The card is a **bearer identifier, not a credential**. Whoever holds it is
  credited. It grants no access, reads no data and cannot pair a phone — the
  worst case is misattributed pay, which the office corrects by revoking and
  reissuing. Cards are one per person, revocable, and reissue mints a new
  code rather than editing the old one.
- Plan §2.1 needs its wording amended from "no in-app person switching" to
  the narrower rule this ADR establishes. Left unamended, the next module
  will read the old sentence and re-litigate this.
- Scanning needs a camera API the phone may not have. The card carries its
  code in readable characters so a supervisor can type it, which also covers
  a damaged or muddy card.
- If a farm ever genuinely needs two pickers on one crate, this does not
  cover it — one crate, one card. That is a new decision, not an oversight.

## Reference

- [docs/piecework-build-scope.md](../piecework-build-scope.md) — the request
- Plan §2.1 (non-goals), §3.4 (printed pairing QR), §6 (data model)
- [ADR 0007](0007-boord-no-worker-attribution.md) — superseded by this
- [ADR 0008](0008-span-self-clocking.md) — set the trigger for reopening §2.1
- [ADR 0010](0010-piecework-pay-boundary.md) — what is done with the attribution
