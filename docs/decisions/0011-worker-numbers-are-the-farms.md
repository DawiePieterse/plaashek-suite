# ADR 0011 — The worker number is the farm's, typed by the office

**Date:** 18 September 2026
**Status:** accepted — amends [ADR 0009](0009-piecework-picker-attribution.md)

## Question

[ADR 0009](0009-piecework-picker-attribution.md) put a scanned printed card
between a crate and its picker, and had Plaashek generate the code on it: a
random 8-character string, revocable, reissued as a new code when a card was
lost. The farm has now said what it actually needs — *type the worker's own
number, and let the QR hold nothing but that* — because the pickers already
have numbers in the system that pays them. Does Plaashek keep generating
codes, or does the farm's own number become the thing on the card?

## Decision

**The farm's number, typed by the office.** `people.worker_number` holds it,
the printed card's QR contains that number and nothing else, and the office
can edit it, along with the worker's name and whether they still work here.
The whole register imports and exports as CSV keyed on that number.

`worker_cards` is gone. With the farm's own number on the card there is no
separate credential to issue, reissue or revoke — reprinting a lost card
prints the same number, because it is the same worker. What used to be
"revoke the card" is now "mark the worker inactive", which is the thing the
office actually means.

## Why

- **It is the join key that already exists.** Plaashek does not pay anyone
  ([ADR 0010](0010-piecework-pay-boundary.md)) — it hands the farm a CSV
  their payment system reads. A number we invented would have to be mapped
  to their number by hand, every pay run, by someone with a spreadsheet.
  That mapping is exactly the paper step this suite exists to remove.
- **Two numbers per worker is one too many.** A picker who has a payroll
  number and a Plaashek code will be asked for the wrong one, and the office
  will keep a lookup table nobody maintains.
- **The card lifecycle was ours, not theirs.** Issue/reissue/revoke made
  sense for a secret we minted. For the farm's own number it is theatre: the
  number on the card is the number in their payroll whether we revoke it or
  not.
- **Import and export make the register one list in two places instead of
  two lists.** The farm's file is the input; the same shape comes back out.

## Consequences

- **A typed number is guessable, and we said so.** ADR 0009 leaned on 40 bits
  of randomness; "014" has none. Anyone who writes a plausible number on a
  card gets credited with those crates until the office notices. This is
  accepted deliberately: the number identifies, it does not authenticate —
  it grants no access, reads no data, and the scanned number stays on every
  crate, so a wrong attribution is visible and correctable afterwards. The
  real control is that a supervisor holds the phone at the scale and can see
  who handed over the crate. Say this plainly to a farm rather than implying
  the card is a credential.
- **Uniqueness is the one rule we enforce**: one number, one person, per
  farm — a partial unique index, plus a clear error when the office tries to
  hand a number to a second worker. Everything else about the numbering is
  theirs, including its shape.
- **Leading zeros are significant.** "014" and "14" are different workers.
  Stripping them would silently merge two people in a payroll, which is
  worse than an import that creates a row the office can see and fix.
- **Import never deletes.** A worker missing from an uploaded file has not
  resigned — they are just not in that file. Only an explicit edit makes
  someone inactive.
- **An edit does not rewrite history.** Renumbering a worker leaves their
  crates attributed to them, and each crate keeps `picker_card_code` — the
  number that was actually scanned at the time — so a re-numbering is
  visible rather than retroactive.
- If a farm ever does need an unguessable card — a high-value crop, a
  history of disputed pay — that is a second, optional code alongside the
  number, not a reversal of this.

## Reference

- [ADR 0009](0009-piecework-picker-attribution.md) — the scan, amended here
- [ADR 0010](0010-piecework-pay-boundary.md) — why the join key matters
- [docs/piecework-build-scope.md](../piecework-build-scope.md)
- Plan §6 (data model), §10 (farm data belongs to the farm)
