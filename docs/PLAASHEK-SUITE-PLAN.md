# Plaashek Suite — Complete Build Plan

**Brand:** Plaashek · [plaashek.co.za](https://plaashek.co.za)
**What this file is:** The only working plan. Greenfield build of Plaashek Management, Farm Admin Tool, Owner Module, field PWAs, and shared sync.
**Status:** v1.20
**Date:** 17 September 2026
**Earlier drafts:** Retired. Do not use suite v0.2, the migration draft, or field-login / seat-cap models.

**Changes from v1.1:** licence lifecycle restored (§5); offline windows defined and made a Phase 0 decision (§3.6); pairing token hardened (§3.4); PWA update/migration added (§8); tech stack restored (§9); backup, offboarding and audit log added (§11); explicit non-goals (§2.1); seasons defined as farm-owned master data, stamped on every record (§4.2, §6).

**Changes from v1.3:** all seven §13 questions closed — see [docs/decisions/](decisions/) (ADRs 0001–0005). Sync engine is PowerSync, not a build-your-own outbox (§9, ADR 0002); Kudde schema pulled from §6 and marked deferred, no build slot (§6, §11, §14, ADR 0005); Phase 4 named to the pilot farm and its 2027 go-live window (§12, ADR 0001).

**Changes from v1.4:** Phase 1 exit checklist (§12) closed on the fake farm — including the last open item, app-upgrade migration with a pending outbox (`apps/field/src/queue.ts`, `queue.test.ts`). Proceeding to Phase 2 (`veldnotas`).

**Changes from v1.5:** Phase 2 exit checklist (§12) closed — real capture in `Notes.tsx` (GPS stamp, weather via `/weather/current`, offline badge, 10s poll), correction model built as decided (ADR 0006). Block picker dropped from scope: GPS location already places the note, so a manual block field would be asking twice for the same thing. Proceeding to Phase 3 (`boord` + `eienaar`).

**Changes from v1.6:** Phase 3 kickoff — Boord + Eienaar reuse audit done, see [docs/boord-reuse-audit.md](boord-reuse-audit.md). Weather stamp and correction model (append-only, ADR 0006) carry over from Phase 2 unchanged. Supplier/multi-grower pack house and BoordOwner's cross-service architecture ruled out as not portable, not deferred. Per-crate worker/team attribution closed — [ADR 0007](decisions/0007-boord-no-worker-attribution.md): dropped, conflicted with the locked "no in-app person picker" rule (§2.1) and its only real use in the reference app was wage calculation, out of scope for year one. Build scope is ready — proceeding to build `harvest_events` and the Boord capture screen.

**Changes from v1.7:** Phase 3 exit checklist closed (§12) — `harvest_events` table, Boord capture screen (`apps/field/src/Harvest.tsx`), `/sync/upload` generalised to route by entity to its own module and table, `GET /blocks` for the picker, and `apps/owner` as the first `eienaar` build (`GET /eienaar/harvest`, totals by block for the active season). Proceeding to Phase 4.

**Changes from v1.8:** Phase 4 kickoff — exit checklist written (§12). Phase 4 is a go-live, not a module build: no reference app, no reuse audit. Excel export (§10 offboarding, §12) does not exist yet in any app — it's on the checklist, not assumed done. Go-live itself stays gated to Jan–Aug 2027 per ADR 0001 regardless of when the checklist closes.

**Changes from v1.9:** CI added (`.github/workflows/ci.yml`) — build, migrate, typecheck and test on every push to main and every PR. Surfaced two latent, Node-version-dependent test bugs (`apps/field`'s and `services/api`'s test scripts each relied on a Node runtime feature not present in CI's pinned Node 20, despite passing on a newer local Node); both fixed with portable patterns already used elsewhere in the repo. Green on main as of commit `8750f60`. A branch protection rule requiring the `test` check exists on `main` but is not enforced — GitHub only enforces private-repo branch protection under a Team/Enterprise organisation account, not a personal account — left as-is, solo/part-time project, revisit if a collaborator joins.

**Changes from v1.10:** Demo seed farm (`infra/seed`, `services/api/scripts/seed.ts`) renamed from the generic `Toetsplaas` to `Mooiplaas`, and its season shaped on Bekfontein's actual documented facts (ADR 0001: litchi, 1 Sep–31 Dec peak picking) instead of a generic calendar year — still fabricated demo data, not real Bekfontein data (none exists yet), just closer in shape to what Phase 4 will need. Does not close or touch any Phase 4 exit checklist item (§12) — those are all about the real farm.

**Changes from v1.11:** Plaashek Management (§4.1) built for the first time — until now it was an empty stub (`apps/management/src` had no files) and the only way to create an organisation, farm or entitlement was the seed script reaching the database directly. Minimal vertical slice: `plaashek_staff` table and a cross-farm login kept on its own session secret (`MANAGEMENT_SESSION_SECRET`) so a farm office session can never authenticate here, `POST /management/login`, `GET/POST /management/farms`, `PUT /management/farms/:id/entitlements`, a thin `apps/management` UI, and `pnpm create-staff` to bootstrap the first login (console has no self-signup). Verified against Mooiplaas via automated tests (`services/api/src/routes/management.test.ts`), a live curl walkthrough, and a full browser click-through (sign in, create a farm, toggle built-in and free-text module entitlements, all confirmed in Postgres). Does not touch or close any Phase 4 exit checklist item (§12) — those are all real Bekfontein data — but removes the tooling gap that stood in front of the first one ("Bekfontein created as a real organisation + farm row").

**Changes from v1.12:** ADR 0001's calendar gate on Phase 4 go-live removed — explicit business decision, both halves lifted (the "no 2026 rollout" call and the "never during 1 Sep–31 Dec peak picking" operational rule). Go-live now proceeds whenever the exit checklist (§12 Phase 4) actually closes, calendar not a factor. The risk this reopens — a real defect surfacing against Bekfontein's actual harvest instead of a fake farm, if the checklist closes mid-pick — is now carried entirely by the checklist's own items (on-site offline-day proof, backup/restore drill against real data), which stay mandatory and unchanged. See ADR 0001's 17 September 2026 update for the full reasoning.

**Changes from v1.13:** Backup/restore mechanism built (§10, §12 Phase 4) — `infra/backup/backup.sh` (`pg_dump`, 30-day retention) and `restore.sh` (the quarterly drill), wired as `pnpm backup` / `pnpm restore`. Drilled once against Mooiplaas: backed up, restored into a throwaway database, spot-checked (farm, entitlements, season all matched), thrown away. The Phase 4 checklist item stays open — it requires a run against real Bekfontein data — but the tooling gap in front of it is closed.

**Changes from v1.14:** Bekfontein created for real (§12 Phase 4) — organisation "Laughing Waters", farm "Bekfontein", licensed for exactly `veldnotas`, `boord`, `eienaar`, created through Plaashek Management rather than a script. First two Phase 4 checklist items close. Caveat: this lives in the local dev database, the only database that currently exists (no production VPS provisioned, plan §9) — move it when real hosting exists. Still open: real people/blocks/camps, real device pairing, on-site offline-day proof, days-since-sync against real signal, revoke on a real device, the backup/restore drill against this farm's actual data, and a go-live date.

**Changes from v1.15:** Plaashek Management's farms list reworked as a table (farm, organisation, language, demo tell, one checkbox column per built module) instead of cards — the demo/real tell is derived from the organisation name ("Demo Organisasie"), not a new schema column. Closed a second real gap the same shape as the first: Plaashek Management could create a farm and license it, but nothing could create that farm's first Farm Admin Tool / Owner Module login (`farm_memberships`) — only the demo seed script or a raw DB insert ever did. `POST /management/farms/:farmId/logins` (person + membership, email/password/role) plus a form in the console close it. Used to create Bekfontein's real admin login, verified end-to-end against `POST /auth/login`.

**Changes from v1.16:** Phase 5 opened, and given the exit checklist it never had — §12's Phase 5 was one line ("§11 order. Each module on the same foundation"), which is not something a phase can close against. Now one checklist per remaining module, and the first of them, `span`, is built: [docs/span-build-scope.md](span-build-scope.md) (no reference app, so a build scope stands in for a reuse audit), `attendance_punches`, the clock-in/clock-out field screen, `/sync/upload` routing, `GET /eienaar/attendance` (days and hours per person, paired at read time) and `GET /export/attendance.csv`. One product call closed on the way: [ADR 0008](decisions/0008-span-self-clocking.md) — a punch belongs to the device's assigned person, no team clocking, the same wall ADR 0007 hit and the same answer. **Phase 4 is not closed** — its remaining items are all on-site at Bekfontein (real people/blocks, real pairing, an offline day, a revoke, the backup drill against real data) and none of them are code. §12's "proceed to Phase 5 only after Bekfontein is live" is being run out of order deliberately: build work continues while the pilot waits on farm-side access, and no Phase 4 item is being counted as done because of it.

**Changes from v1.17:** seasonal piece-work built — the farm pays its litchi pickers per kilogram, which Span (permanent employees, ADR 0008) does not cover. Two locked decisions reopened deliberately rather than worked around: [ADR 0009](decisions/0009-piecework-picker-attribution.md) supersedes ADR 0007 and narrows §2.1 below — a crate is tied to its picker by a **printed worker card, scanned at the scale**, so identity still comes from paper and never from a list of names on the phone; [ADR 0010](decisions/0010-piecework-pay-boundary.md) splits the wages non-goal — §2.1's "no payments" is about Plaashek being paid by the farm (ADR 0004), not the farm paying its workers, so kilograms and rand are in while payslips, payment and any minimum-wage claim are out. Built on Boord's existing capture rather than a new module: `worker_cards`, `piece_rates` (effective-dated, integer cents, base + daily target + bonus), `harvest_events.picker_id`/`picker_card_code`, `people.kind`, the scan-then-weigh step on the scale phone, and a Farm Admin Tool section for the register, the printed cards, the rate and the payout, plus `/export/piecework.csv`. See [docs/piecework-build-scope.md](piecework-build-scope.md).

**Changes from v1.18:** the two office tools reorganised as **tabs** — one tab per field module the farm is licensed for, plus a **Farm settings** tab for what belongs to the whole farm (§4.2, §4.3). A module tab appears only when Plaashek Management has switched that module on, so the office never looks at a screen for something it has not bought; with nothing licensed, Farm settings is the only tab. The Farm Admin Tool and the Owner Module were most of the way to being the same screen already, so the shared half now lives in `@plaashek/ui-office` (previously stylesheet-only, now the tab shell, the rollups, seasons, the exports and the farm summary, plus one copy of their wording). They stay two apps with two logins and two hosts as §4.3 requires — what differs is what each may write, and the owner's own features land as extra panels in the same tabs.

**Changes from v1.19:** worker cards now carry the **farm's own worker number**, typed by the office, and the QR holds that number and nothing else — [ADR 0011](decisions/0011-worker-numbers-are-the-farms.md), amending ADR 0009. It is the key the farm's payment system already uses, so the piece-work export joins to their payroll with no mapping table in between. The register is editable (number, name, and whether the worker still works here) and moves in and out as CSV keyed on that number: an import updates numbers the farm already has, adds new ones, and never deletes. `worker_cards` is gone with the code we used to mint — reprinting a lost card prints the same number, so there is nothing to issue or revoke, and "revoke the card" becomes "mark the worker inactive". The trade-off is written down rather than glossed: a typed number is guessable where a random code was not, so the card identifies and never authenticates.

---

## 1. What we are building

Plaashek sells **modules per farm**. A farm buys `boord`, or `boord + kudde`, and may put the software on as many field phones as it needs. Devices are free. There are no seats.

Field phones have **no login**. After a printed QR is scanned, open the app and work. Offline first. Sync in the background when signal returns.

Office tools have a normal login. Plaashek staff have a separate tool the farm never sees. That is how a sale becomes access, and how a login is tied to the right farm and the right activated solutions.

The four existing apps (Boord, Boord Owner, Notes, Kudde) are **reference only**. Reuse a screen or a data shape if it drops into this architecture. Otherwise rebuild.

---

## 2. Decisions that are locked

| Decision | Call |
|---|---|
| Commercial unit | Module × farm. Devices uncapped and free |
| Field access | No login, no PIN, no person picker, no farm picker |
| Pairing | Printed QR. Scan opens that field app |
| Device role | One app per phone until a second printed QR is scanned |
| Licence ceiling | Plaashek Management switches modules on for the farm |
| Licence floor | A phone only runs modules whose QRs it has scanned |
| Attribution | Every save stamped with assigned person + device + farm. Admin assigns the name. A seasonal picker's crate also carries the picker, read off a scanned printed card — [ADR 0009](decisions/0009-piecework-picker-attribution.md) — and the number on that card is the farm's own ([ADR 0011](decisions/0011-worker-numbers-are-the-farms.md)) |
| Owner view | Separate `eienaar` module, read-only. Not folded into Boord |
| Old apps | Reference implementations, not a data migration programme |
| Module code spelling | `werkswinkel` — code matches the Afrikaans name. Fix the v1.1 typo everywhere |

### 2.1 Explicit non-goals for v1

Say these out loud so they don't creep back in:

- **No contractor / multi-farm person.** One device, one farm, full stop. If a picking team works three farms, that is three devices or three re-pairings. Revisit only when a paying farm demands it.
- **No in-app person switching.** The admin assigns the name; the phone never asks. Narrowed 17 September 2026 ([ADR 0009](decisions/0009-piecework-picker-attribution.md)): identity may come from a **scanned printed card** — the same "paper is the credential" model as the pairing QR — but never from a list of people on the phone. A dropdown of names is still ruled out.
- **No payments inside Plaashek Management in year one** unless §13 Q3 says otherwise. This is about *Plaashek being paid by the farm* ([ADR 0004](decisions/0004-year-one-billing.md)). The farm paying its own workers is a separate question, settled by [ADR 0010](decisions/0010-piecework-pay-boundary.md): piece-work kilograms and rand are calculated and exported; payslips, moving money, and any minimum-wage compliance claim are not.
- **No end-to-end encryption** that would block server-side Excel export and support.
- **No Play Store listing.** PWA install only.
- **No CRDT.** Last-write-wins plus append-only events (§7).

---

## 3. Access model

### 3.1 Three kinds of access

**Field device — no login.**
After pairing: open → work. Offline. Silent sync. Nothing to type.

**Farm office — normal login.**
Email / password or magic link on a computer. Farm Admin Tool and Owner Module. This is the only farm-facing login.

**Plaashek staff — separate login.**
Plaashek Management only. Farms cannot see it and cannot switch on a module they have not bought.

### 3.2 Who controls the phone

From the Farm Admin Tool:

1. **Add device** — pick a person and **one module** (the first role).
2. **Print** the pairing QR.
3. Field phone **scans the paper**. That app opens. Ticket lands. Device is live.

Every capture is stamped with that person and that device. If the phone changes hands, the admin reassigns the name in the console. The phone does not change behaviour and does not ask who is using it.

### 3.3 One role unless a second QR is scanned

Default: **one device, one app.**

A second app appears on that phone only when:

1. The farm is licensed for that module (Plaashek Management).
2. The admin prints an **Add app** QR for this device + that module.
3. The same phone scans that paper.

Buying `boord + kudde` for the farm does not put Kudde on the picker phone.

### 3.4 Printed pairing QR

Daily use has no scan. A blank phone still has to learn its farm and its first app.

**First role**

1. Farm Admin Tool → **Add device**.
2. Person (stamp name) + one licensed module + optional device label ("Pakhuis tablet").
3. System writes `device_id + farm_id + person_id + module_code + signed token`.
4. QR encodes `https://app.plaashek.co.za/pair/…`.
5. Admin **prints** the slip: farm, person, **module name**, date, and the expiry date. Keep a file copy.
6. Phone scans the paper, with signal this once. Pair at the office, not in the top camp.
7. Phone opens **that** field app only. Ticket stored. "Add to home screen." After that: icon → work.

**Add a second app**

1. Select the existing device → **Add app** → another licensed module.
2. New QR printed for this `device_id` + that module.
3. Same phone scans it. Second app added. Second home-screen icon allowed.
4. Daily use is still: open the icon → work.

If the farm is not licensed for the module on the QR, the scan fails.

**QR rules**

- One-shot per device + module. Scan again: "hierdie program is al op die foon."
- **Token life: 48 hours, not 14 days.** A printed slip is a bearer credential — whoever scans it first gets in. Short life plus reprint-on-demand is cheaper than a long-lived slip in a bakkie door pocket.
- **Pending state is visible.** An unscanned token shows on the device list as *"Wag vir paring — gedruk 14:20, verval môre 14:20"*, with a one-tap cancel. An admin who prints a slip and loses it kills it immediately rather than hoping.
- Reprint allowed before first scan of that slip (reprint reissues, old token dies).
- After pair: no reprint. Use **Replace device** (old ticket dead, new first-role QR) or **Add app** (new module QR).
- Remove an app from a phone from the office only.
- Change the assigned person from the office. No new QR.
- Pairing needs signal. Each installed app then works offline.
- Expired tokens are dead paper. Print again.

### 3.5 Revoke

One tap in the Farm Admin Tool. Next sync: ticket rejected, outbox refused.

A stolen phone still has its installed app(s) until that sync — see §3.6. Make revoke the loudest button on the device list. Plaashek staff can revoke from Plaashek Management if the farm admin cannot.

### 3.6 Offline windows — decide these in Phase 0

Three separate numbers, easy to conflate, all needed before Phase 1 code:

| Window | What it controls | Proposed |
|---|---|---|
| **Ticket life** | How long a device keeps working with no successful sync at all | 21 days, then read-only with "Gaan na die hek vir sein" |
| **Revoke reach** | How long a revoked phone keeps working before its next sync kills it | Same as ticket life — it is the same mechanism. Accept it, and say so to farms |
| **Licence grace** | How long after a farm's licence lapses the apps keep capturing | 14 days (see §5) |

The honest statement to a farm: *a phone that never sees signal cannot be switched off remotely.* Revoke is immediate at the server; on the handset it lands at next contact. That is the cost of working with no tower.

---

## 4. Product shape

```
┌─────────────────────────────────────────────┐
│  Plaashek Management     staff only         │
│  farms · module on/off · billing · revoke   │
└──────────────────┬──────────────────────────┘
                   │ farm entitlements
┌──────────────────▼──────────┬───────────────┐
│  Farm Admin Tool            │  Owner Module │
│  devices, printed QRs,      │  (`eienaar`)  │
│  people, blocks, camps      │  read rollup  │
└──────────────────┬──────────┴───────────────┘
                   │ ticket = farm + device + scanned modules
┌──────────────────▼──────────────────────────┐
│  Field PWA(s) on the phone                  │
│  first QR opens that one app                │
│  further QRs add further apps               │
└──────────────────┬──────────────────────────┘
                   │
     ┌─────────────┼──────────────┬────────────┐
     ▼             ▼              ▼            ▼
  Veldnotas      Boord          Kudde        Span
  Stoor          Water       Werkswinkel     Oudit
  Eienaar (office)            + custom PWAs
```

Hosts (proposed):

| Surface | Host |
|---|---|
| Marketing | `plaashek.co.za` |
| Plaashek Management | `hek.plaashek.co.za` |
| Farm Admin Tool | `admin.plaashek.co.za` |
| Field apps + pair URL | `app.plaashek.co.za` |

Do not share cookies across `hek` and `admin`.

### 4.1 Plaashek Management

Staff only. Sale → access. Switch modules on or off per farm. Billing status. Cross-farm support. Staff revoke. A farm admin has no write path into this layer.

### 4.2 Farm Admin Tool

Farm-facing, computer. **Tabbed:** one tab per field module the farm is
licensed for, in §11's build order, then **Farm settings**. A module tab is
drawn only when Plaashek Management has that module switched on for the farm
(the licence ceiling, §5) — an unlicensed module has no tab, not a disabled
one. A module with no office panel built yet has no tab either; an empty tab
is worse than no tab.

What sits where: a module's tab holds that module's rollups, whatever the
office sets up for it, and its CSV export. **Farm settings** holds what is
true of the whole farm rather than one module — the farm's name and language,
which modules are switched on, devices and their printed QRs, seasons, and
the two things the office has to act on (captures held behind a lapsed
licence, captures with no season).

- People list
- Add device (person + first module) and print QR
- Add app (second QR) on an existing device
- Reassign person, reprint unused QR, replace device, revoke
- Master data: blocks, camps, people, assets, **seasons**
- **Seasons** — the farm defines its own season names and date ranges here (e.g. *Oes 2026/27*, opened 1 Nov, closed 15 Feb). One active season at a time per farm. Modules that need a season read it; they never define their own. Editable, because a pick runs late more often than not
- Reads farm entitlements. Cannot grant a module

Show on the device list: assigned person, installed apps, last seen, last sync, **pending unscanned QRs**, and **days since last sync** highlighted when a phone is drifting toward its ticket expiry.

### 4.3 Owner Module (`eienaar`)

Office, read-only rollup across licensed modules. Not device admin. On a small farm one person may use both office tools; keep the tools separate.

**Separate tools, one shell.** The owner sees the same tab strip over the
same panels as the Farm Admin Tool (§4.2) — the difference is what may be
written: no devices, no piece-work rate, no season edits. They remain two
apps, two logins and two hosts; only the drawing of them is shared, in
`packages/ui-office`. Owner-only features land as extra panels inside the
same tabs rather than as a third layout.

Boord Owner (reference app) seeds the first version of `eienaar`. While only Boord is live, `eienaar` is Boord figures in owner form. It grows as more modules ship.

### 4.4 Field apps

No farm picker. First QR opens that module. No tile or icon for a module this phone has not scanned, even if the farm bought it.

### 4.5 Modules

One job each. One shared workspace (blocks, camps, people, assets, seasons).

| Code | Module | Where it runs |
|---|---|---|
| `veldnotas` | Veldnotas | Field |
| `boord` | Boord | Field |
| `kudde` | Kudde | Field |
| `span` | Span | Field |
| `stoor` | Stoor | Field / store |
| `water` | Water | Field |
| `werkswinkel` | Werkswinkel | Field / workshop |
| `oudit` | Oudit | Office |
| `eienaar` | Eienaar | Office |
| `custom:*` | Pasgemaak | As scoped |

---

## 5. Licence lifecycle

v1.1 had no answer for "the farm stopped paying." Never brick a farm mid-pick over a late invoice.

| Status | Field apps | Office tools | Who sees it |
|---|---|---|---|
| `active` | Full use | Full use | Nobody — it's normal |
| `grace` (14 days past `valid_until`) | Full use, nothing changes on the phone | Banner | Owner and admin only |
| `suspended` | Existing queue still flushes; **new captures blocked**; history readable | Read + export only | Owner and admin |
| `cancelled` | Dead after next sync | Read + export for 90 days, then archive | Owner and admin |

Rules:

- Field workers never see billing copy. Ever. A picker is not the debt collector.
- Status lives on the entitlement row and rides in the farm ticket.
- A phone inside its offline window keeps capturing through a `suspended` flip until it next syncs. Those records are **accepted into a holding area**, not dropped — the office sees "lisensie het verval, 14 items wag." Silent data loss is worse than a late invoice.
- Reactivation releases the holding area.

---

## 6. Data model

English in the database. Afrikaans on screen.

```
organisations
farms
entitlements              farm_id, module_code, status, valid_from,
                          valid_until, grace_days, source
people                    farm name list — a person needs no login.
                          `kind` is staff or seasonal: staff may carry a
                          paired phone, a seasonal picker carries a card.
                          `worker_number` is the farm's own number for them,
                          typed by the office and unique per farm (ADR 0011);
                          `active` is how a worker who has left stops
                          collecting crates
farm_memberships          office logins only (admin / owner)
devices
device_assignments        device_id, person_id, assigned_at, assigned_by
pairing_tokens            device_id, module_code, token, printed_at,
                          printed_by, expires_at, used_at, cancelled_at
device_modules            device_id, module_code, paired_at
                          — row created only after a successful QR scan
audit_log                 actor, actor_type (farm / staff), action,
                          target, farm_id, at
                          — staff support access, revokes, entitlement
                            changes, QR prints. Farm-visible for its own farm

piece_rates              farm_id, season_id, effective_from,
                         base_cents_per_kg, target_kg, bonus_cents_per_kg
                         — what a kilogram is worth (ADR 0010)

blocks
camps
lines
assets
seasons                   farm_id, name, starts_on, ends_on, is_active
                          — farm-defined in the Farm Admin Tool.
                            One active per farm. Editable
people_farm_profile

notes                     veldnotas
harvest_events            boord — also picker_id + picker_card_code for
                          seasonal piece-work (ADR 0009)
kudde                     deferred — no schema until a real farm is
                          contracted (ADR 0005)
attendance_punches        span
stock_items, stock_moves  stoor
meter_readings            water
work_orders, fuel_logs    werkswinkel
audit_packs               oudit
```

Every workspace row:

`id, farm_id, module_code, season_id, created_by, device_id, created_at, updated_at, revoked_at, rev`

`created_by` is the person assigned to the device at save time.

`season_id` is the farm's active season at save time, resolved on the **device** from its synced copy — so a phone offline for a week still stamps correctly. Modules that are genuinely season-less (Werkswinkel, Water) leave it null rather than inventing one.

If a farm has no active season when a season-dependent module tries to save, the phone still saves — never block a capture over configuration — and the record is flagged for the office to assign. The Farm Admin Tool shows "3 opnames sonder seisoen."

No cross-farm foreign keys.

**Person vs login:** most people on a farm exist only as a name to stamp records with. They have a `people` row and no `farm_memberships` row, no password, no email. Only the admin and owner get a login.

---

## 7. Sync

Never lose a crate. Never mix farms. Survive a phone that only finds signal at the gate.

Outbox: `outbox_id, farm_id, module_code, entity, entity_id, op, payload, client_time, base_rev, photo_ids[]`

Pull by cursor per device per module the phone actually has.

Photos and voice: save locally with the note; upload later on a separate lazy channel. The note is valid if the file is still queued. Compress on device before upload.

On each successful sync, store server time and clock skew. Veld phones lie about the time.

Conflicts: last-write-wins on scalars; append-only for events (crates, treatments, punches, notes). Two edits to the same animal tag: keep both, flag the office. No CRDT in v1.

Server rejects writes for a module the farm is not licensed for, and for a module this device has not paired — except inside licence grace, where they land in the holding area (§5).

**Unsynced data is at risk data.** A phone lost with three days of unsynced crates loses three days. The admin device list shows days-since-sync (§4.2) so that is visible before it hurts.

---

## 8. Field UX and updates

1. One job per screen.
2. Large primary button, gloves, sun, one hand.
3. Save is local and instant. "Gestoor op die foon."
4. Words the farm already uses: *blok, kamp, krat, trop, oormerk*.
5. Photo, voice, or text.
6. Failure says what to do: "Gaan na die hek vir sein. Jou syfers is op die foon."

A Boord-only phone never shows a Kudde icon.

**Updates and local schema migration** — design in Phase 1, not later:

- Service worker plus versioned asset bundles. Fix something, every phone has it next open.
- Each module updates independently. A Boord hotfix does not re-download Kudde.
- Local schema migrations run **before the UI unlocks**, never mid-capture.
- A migration needing a large download warns on weak signal and allows deferral — **except** when the local schema can no longer read new server records.
- Never lose the outbox during a migration. Test upgrade-with-pending-writes explicitly; it is the failure that loses a farm's day.

---

## 9. Technology

One developer, part-time, ZA hosting, long-lived farm data. Decisions, not religion.

| Layer | Choice | Why |
|---|---|---|
| PWA | TypeScript + Vite, React or Svelte | Small bundle, good PWA tooling |
| Local store | SQLite via PowerSync client SDK (OPFS-backed in browser) | Decided — ADR 0002 |
| API | Node or Go behind Caddy | Simple to host and reason about |
| DB | Postgres, ZA region | Farms, entitlements, tickets, sync cursors |
| Media | S3-compatible in ZA (af-south-1 or local) | Photos and voice notes |
| Tickets | Signed JWT — farm modules (ceiling) + device modules (floor) | Verifiable offline |
| Messaging | WhatsApp Business API for office notices | How farms already talk. Approval + per-message cost is a Phase 0 line item |
| Hosting | One VPS with backups; k8s only if scale demands | Matches current scale |
| Observability | Errors carry `farm_id` and `device_id`, never field note content | Support without reading the farm's day |

**Build vs buy — decided (ADR 0002):** buying PowerSync (self-hosted, `af-south-1`) rather than a from-scratch outbox/cursor engine. Conflict logic (LWW on scalars, append-only on events), revoke, and the lazy photo/voice channel stay ours regardless — PowerSync only removes the queue/cursor/local-storage plumbing.

---

## 10. Security, backup, offboarding

- Host in South Africa.
- TLS. Encryption at rest.
- Pairing tokens signed, 48-hour life, one-shot, cancellable while pending.
- Device ticket lists only scanned modules.
- Support access time-boxed and written to `audit_log`, visible to that farm.
- Farm data belongs to the farm. Excel export from the office tools.
- Plaashek is operator. The organisation is responsible party. Put this in the order form.

**Backup and restore** — missing from v1.1, and Stoor holds chemical records with legal weight:

- Nightly Postgres backup, off the app server, retained 30 days.
- Media bucket versioned.
- **Restore tested quarterly.** An untested backup is a rumour.
- Document recovery time honestly. A one-VPS setup means hours, not minutes. Say so before a farm asks.

**Offboarding:** on cancellation, deliver a full Excel export of every module, confirm receipt, then delete within the agreed window. Write the window into the order form so it is not negotiated under pressure.

**The phone is the credential.** Revoke is the control, bounded by §3.6. Wrong-person data from a forgotten reassignment will be more common than theft — show assigned name and last-seen on the admin device list.

---

## 11. Module order and reuse

| Order | Module | Reference app | Note |
|---|---|---|---|
| 1 | `veldnotas` | Notes | Proves print-QR → one app → offline sync |
| 2 | `boord` | Boord field | Second field module |
| 3 | `eienaar` | Boord Owner | Built with Boord. Read-only |
| 4 | `span` | — | Assigned-person stamp makes clocking work |
| 5 | `stoor` | — | New |
| 6 | `kudde` | — | Deferred, no build slot — ADR 0005 |
| 7 | `water`, `werkswinkel` | — | New |
| 8 | `oudit` | — | Packs records. Last |

Reuse a reference screen only if it fits outbox + `farm_id` + no field login. Otherwise rebuild.

---

## 12. Phases

Solo, part-time. **Sizing health warning:** Phase 1 builds a signed-ticket system, two admin consoles, a QR pairing flow and an offline sync engine. Three to four part-time weeks is optimistic unless §9's build-vs-buy call goes to "buy." Track it honestly rather than compressing the pilot later.

### Phase 0 — Decisions (1 week)

Answered — see [docs/decisions/](decisions/) (ADRs 0001–0005). Hosts, module codes, the three offline windows (§3.6, ADR 0003), and build-vs-buy on sync (§9, ADR 0002) are all closed.

### Phase 1 — Foundation (3–4 weeks, see warning)

Schema, tickets, sync, print QR, Plaashek Management (module on/off), Farm Admin add-device / print / add-app / assign / revoke. Update and migration scaffolding (§8).

Exit on a fake farm — **closed 17 September 2026**:

- [x] Print QR for Veldnotas → scan → that app opens, only that app.
- [x] Offline write → sync, stamped with the assigned person.
- [x] Second QR for another licensed module adds the second app.
- [x] QR for an unlicensed module fails.
- [x] Unscanned QR expires and shows pending, then cancels cleanly.
- [x] Revoke stops sync.
- [x] Licence flipped to `suspended` → captures inside grace land in the holding area, none lost.
- [x] Season defined in the Farm Admin Tool syncs to the phone; an offline capture stamps the correct `season_id`.
- [x] App version bump with pending outbox items → migration runs, outbox survives.

No module polish until this is boring. It's boring — proceed to Phase 2.

### Phase 2 — `veldnotas` (3–4 weeks)

Real Notes-shaped capture on the foundation.

Exit — **closed 17 September 2026**:

- [x] Offline note survives: local save is instant, never waits on network (`apps/field/src/Notes.tsx`).
- [x] Farm without the entitlement cannot pair that QR — Phase 1 foundation, unchanged by this phase.
- [x] Location stamped on save; GPS warm-up on screen-open, never blocks save on a missing fix.
- [x] Weather stamped via a server-proxied `/weather/current` route (Open-Meteo, no API key), raced against a 1.5s timeout so a slow lookup never blocks save.
- [x] Offline badge shows the queued count; sync flushes on mount, on `online`, and a 10s poll for flaky rural radios that regain signal without firing the event.
- [x] Correction model closed — no edit, no delete (ADR 0006).
- Block picker was in the reuse audit's original scope but got dropped: GPS already places the note, so a manual block field asks the worker to say the same thing twice. `notes.block_id` stays in the schema (nullable, unused by this UI) rather than a migration nobody asked for.
- Tags, photos, dashboard/stats — still out of scope, as the reuse audit called: no local blob store for photos yet, and nothing here asks for tags.

No module polish beyond this until a farm asks — proceed to Phase 3.

### Phase 3 — `boord` + first `eienaar` (4–5 weeks)

Field harvest capture. Owner sees it after sync.

**Season check:** Boord touches harvest capture. Do not run Phase 3 or Phase 4 across the pilot farm's pick. Map this against their season in Phase 0 and schedule around it.

Exit — **closed 17 September 2026**, scope per [docs/boord-reuse-audit.md](boord-reuse-audit.md):

- [x] `harvest_events` table: workspace row stamp + `block_id` (FK, not null), `weight_kg` (not null), `deduction_kg`, weather columns. Append-only — no edit path (ADR 0007's precedent).
- [x] Field capture screen (`apps/field/src/Harvest.tsx`): block picker, weight, optional deduction. Weather race and the offline-badge/flush effect ported from `Notes.tsx` as-is.
- [x] `GET /blocks`: picker data for the block field, device-ticket-gated, not carried in the signed ticket.
- [x] `/sync/upload` generalised from a single hardcoded module to a per-entity module map (`notes` → veldnotas, `harvest_events` → boord), so a mixed batch checks pairing/licence once per module and idempotent-inserts each entity into its own table. Suspended/cancelled licence holds the write, same as veldnotas.
- [x] `GET /eienaar/harvest` (`apps/owner`, new app): crates + kg by block, for the farm's active season only, staff-auth-gated the same way `/farm` already is. No active season returns an empty rollup rather than mixing seasons.
- Not in this phase (closed by the audit, not deferred): worker/team attribution (ADR 0007), lots/dispatch/pack-house receiving, wages, dashboard history/risk analysis, the multi-grower Supplier model.

No module polish beyond this until a farm asks — proceed to Phase 4.

### Phase 4 — First real pilot farm (Laughing Waters / Bekfontein)

One live farm. Printed QRs, offline days, sync at the gate, Excel out. Modules: Veldnotas, Boord, Eienaar. Do not start Span to delay this. No calendar gate on go-live (ADR 0001, updated 17 September 2026) — go live whenever the exit checklist below actually closes, including during real peak picking. The offline-day proof and backup/restore drill items are what's carrying that risk now; they stay mandatory.

Not a module build — no reference app, no reuse audit. The exit criteria are the farm working for real, on what Phases 1–3 already shipped, plus the one missing piece (Excel export) those phases deferred to here.

Exit:

- [x] Excel export shipped from the office tools — `GET /export/notes.csv` and `GET /export/harvest.csv` (`services/api/src/routes/export.ts`), staff-auth-gated the same way `/farm` and `/eienaar/harvest` are, one button each in the Farm Admin Tool and `apps/owner`. CSV, not a binary `.xlsx` — Excel opens it natively, so no dependency was added for a two-table export.
- [x] CI green on `main` (`.github/workflows/ci.yml`: build, migrate, typecheck, test on every push/PR). Branch protection requiring the `test` check is configured but not enforced — GitHub gates private-repo enforcement behind a Team/Enterprise org account; left inert as a solo/part-time project, free to activate the moment a collaborator joins or the repo moves org-side.
- [x] Bekfontein created as a real organisation + farm row, replacing no seed data (ADR 0001: genuine first deployment, not a migration). Created 17 September 2026 via Plaashek Management (`POST /management/farms`) — organisation "Laughing Waters", farm "Bekfontein", `af`. Lives in the local dev database (no production VPS exists yet, plan §9) — move it when real hosting is provisioned.
- [x] Real entitlements set for exactly `veldnotas`, `boord`, `eienaar` — no `span`, no `kudde`. Set 17 September 2026 via `PUT /management/farms/:id/entitlements`.
- [ ] Bekfontein's litchi season(s) entered in the Farm Admin Tool with real dates (peak picking runs 1 Sep–31 Dec, ADR 0001) — informational now that go-live isn't gated to avoid that window, but the season still has to be right for captures to stamp correctly.
- [ ] Real people, blocks, camps entered for the farm — not the fake-farm fixtures from `infra/seed`.
- [ ] Real devices paired on-site: printed QR → scan → correct single app opens, for each of the three modules across however many phones the farm actually runs.
- [ ] A full offline day proven on an actual phone at Bekfontein: capture with no signal, sync once back at the gate, nothing lost.
- [ ] Days-since-sync and pending-QR visibility (§4.2) checked against real rural signal, not the office Wi-Fi the fake farm was tested on.
- [ ] Revoke tested on a real device at the farm, not the fake farm.
- [ ] Backup/restore drill run at least once against real Bekfontein data before go-live (§10 — "an untested backup is a rumour" applies doubly to the first real farm). Mechanism now exists and is drilled against Mooiplaas (`infra/backup/backup.sh`, `restore.sh`, `pnpm backup`/`pnpm restore`) — still open until run against the real farm's data.
- [ ] Go-live date confirmed against the farm's actual season calendar — no calendar restriction to check it against (ADR 0001, updated 17 September 2026), just make sure it isn't a surprise to the farm.

No Span, Stoor, Water, Werkswinkel, Oudit, or Kudde work starts before this closes — proceed to Phase 5 only after Bekfontein is live and stable on Veldnotas + Boord + Eienaar.

### Phase 5 — Remaining modules

§11 order, each module on the same foundation. Re-evaluate Kudde after Q4.

Phase 4's remaining items are all on-site at the pilot farm and none of them
are code (real people and blocks, real pairing, an offline day, a revoke, the
backup drill against real data). Rather than idle the build behind farm-side
access, Phase 5 proceeds in parallel — with nothing on Phase 4's checklist
counted as closed because of it, and Bekfontein still first in line for any
defect either phase surfaces.

A module is done when it has: a build scope (a reuse audit where a reference
app exists, [docs/span-build-scope.md](span-build-scope.md)'s shape where one
does not), its table and migration, its field or office screen, its
`/sync/upload` entity routing with the held-writes and not-paired paths
proven, whatever the office needs to read it, a CSV export, and tests for all
of it.

**`span` — closed 17 September 2026:**

- [x] Build scope written, with the one product call it raised closed as an ADR — [docs/span-build-scope.md](span-build-scope.md), [ADR 0008](decisions/0008-span-self-clocking.md) (a punch belongs to the device's assigned person; no team clocking, no picker).
- [x] `attendance_punches` table (`services/migrations/0007_abandoned_trauma.sql`): workspace row stamp + `direction` + the opportunistic location stamp. Append-only, no edit path.
- [x] Field capture screen (`apps/field/src/Span.tsx`): one button that reads *Klok in* or *Klok uit* off this phone's last punch, which is kept locally so the answer is right with no signal. Offline badge and flush effect reused unchanged.
- [x] `/sync/upload` routes `attendance_punches` → `span`: idempotent by client uuid, not-paired refused, a suspended licence holds the punch instead of dropping it (`sync.span.test.ts`). First module to arrive since Phase 3 generalised that route — it needed one map entry and one apply function, which is what that generalisation was for.
- [x] `GET /eienaar/attendance`: days and hours per person for the active season, pairing each `in` with the `out` that follows it (`lib/attendance.ts`). Nothing derived is stored; an unpaired punch is reported open, never guessed at.
- [x] `GET /export/attendance.csv` — raw punches, one row each, a button in both office tools.
- [x] Proven end to end against the demo farm on 17 September 2026: printed QR → scan in a real browser → clock in → reload → clock out, both punches synced and season-stamped; a second phone's forgotten clock-out shows as open in Eienaar; a replayed batch inserts once.
- Not in this module (closed by the scope, not deferred): team clocking and any roll-call screen (ADR 0008), leave and rosters, and overtime/rounding/public-holiday rules. Span says when someone worked and never what that is worth — [ADR 0010](decisions/0010-piecework-pay-boundary.md) opened pay only for piece-work, priced per kilogram, and hourly wages stay out.

**Seasonal piece-work — closed 18 September 2026.** Not a module in §11's
order: the farm raised it once Span shipped and turned out to be for
permanent employees only. It extends Boord rather than adding a module code
([docs/piecework-build-scope.md](piecework-build-scope.md)).

- [x] Scope written, with both product calls it raised closed as ADRs — [ADR 0009](decisions/0009-piecework-picker-attribution.md) (scanned printed card, supersedes ADR 0007, narrows §2.1) and [ADR 0010](decisions/0010-piecework-pay-boundary.md) (calculate pay, never move money, never imply a minimum-wage check).
- [x] `worker_cards`, `piece_rates`, `harvest_events.picker_id`/`picker_card_code`, `people.kind` (`services/migrations/0008_awesome_garia.sql`).
- [x] Scan before the weight on the scale phone (`apps/field/src/CardScanner.tsx`): `BarcodeDetector` where the handset has it, the printed code typed where it does not. Card list cached on the device, so a scan resolves offline.
- [x] An unknown card never blocks the crate: the code is saved, resolved server-side at sync, and anything still unplaced is shown to the office (`/piecework/unattributed`, and on the payout screen).
- [x] Only the code ever leaves the phone — a device cannot assert who picked a crate, it can only report what it read.
- [x] Tiered pay per picker per farm-day, priced against the rate in force that day, in integer cents (`lib/piecework.ts`). Derived at read time; a late crate changes the answer.
- [x] Farm Admin Tool section: register a worker under the farm's own number, edit that number/name/standing later, print the card, set the rate, read the payout, with unplaced crates and the no-minimum-wage-check caveat both on screen. `GET /export/piecework.csv` in both office tools.
- [x] The register imports and exports as CSV keyed on the worker number (`POST /piecework/workers/import`, `GET /export/workers.csv`), so the farm's payment system and this list stay the same list — [ADR 0011](decisions/0011-worker-numbers-are-the-farms.md), 18 September 2026.
- [x] Proven end to end against the demo farm on 18 September 2026: rate set and worker registered in the browser, card printed, its code used at the scale phone, two crates (70 kg and 52 kg less 2 kg) attributed to the picker, payout showing 120 kg and R330.00 — 100 kg at R2.50 plus 20 kg at R4.00.
- Not in this scope: payslips, payment, minimum-wage checking (no hours exist for a seasonal picker — Span is permanent staff), per-picker grading, and splitting one crate between two pickers.

**`stoor` — next, not started.** Chemical and stock records with legal weight (§10), so the backup story matters more here than anywhere else.

**`water`, `werkswinkel` — not started.** Both season-less (§6) — the first modules to leave `season_id` null, which no code path has exercised yet.

**`oudit` — last, not started.** Packs the other modules' records; it cannot be built before they exist.

**`kudde` — no build slot** ([ADR 0005](decisions/0005-kudde.md)). Re-evaluate after Q4, and only against a contracted livestock farm.

---

## 13. Open questions — all closed

| # | Question | Decision | ADR |
|---|---|---|---|
| 1 | First pilot farm and modules | Laughing Waters / Bekfontein — `veldnotas`, `boord`, `eienaar` | [0001](decisions/0001-pilot-farm.md) |
| 2 | Minimum Android version (Dexie vs SQLite/OPFS) | Moot — PowerSync ships SQLite/OPFS from day one | [0002](decisions/0002-sync-engine.md) |
| 3 | Year-one billing | WhatsApp invoice, manual EFT, no in-app payment | [0004](decisions/0004-year-one-billing.md) |
| 4 | Kudde: real or speculative | Deferred — no build slot until a real livestock farm is contracted | [0005](decisions/0005-kudde.md) |
| 5 | The three offline windows (§3.6) | Confirmed as proposed — 21 / 21 / 14 days | [0003](decisions/0003-offline-windows.md) |
| 6 | Sync engine: build or buy | Buy — self-hosted PowerSync | [0002](decisions/0002-sync-engine.md) |
| 7 | Build scheduling against the pilot's pick | Originally pushed to Jan–Aug 2027, no 2026 rollout; both gates removed 17 September 2026 — go live whenever the checklist closes | [0001](decisions/0001-pilot-farm.md) |

---

## 14. Risks

| Risk | Absorption |
|---|---|
| Foundation is the hard part | No module polish before Phase 1 exit |
| Phase 1 overruns and squeezes the pilot | Move the pilot date, not the exit criteria. §9 build-vs-buy is the real lever |
| Old code bends the new model | Rebuild if it assumes local-only or a field login |
| Stolen phone works until revoke syncs | One-tap revoke, staff backup, windows set in §3.6, stated plainly to farms |
| Printed slip is a bearer credential | 48-hour life, pending state visible, one-tap cancel |
| Admin forgets to reassign the name | Device list: who, which apps, last seen |
| Phone lost with days of unsynced work | Days-since-sync on the device list before it becomes a loss |
| Device sprawl | Count on the dashboard. No fee |
| Second QR skipped, phone stuck on one app | That is intended. Print Add app when they need it |
| Licence lapses mid-harvest | Grace, then holding area. Never a blocked picker |
| Migration eats a pending outbox | Explicit Phase 1 exit test |
| Pilot delayed for another module | Phase 4 before Span / Stoor / Kudde |
| Pilot lands mid-pick | Schedule from the season, not the sprint |
| Kudde spec unvalidated | Deferred by design — no build slot until a real livestock farm is contracted (ADR 0005) |
| Season not set, or set late, when a pick starts early | Phone saves anyway and flags; office assigns from "opnames sonder seisoen." Never block a capture over config |
| Backup never tested | Quarterly restore drill, diarised |
| Worker card lost, swapped or borrowed — the wrong picker gets paid | The card is a bearer identifier and says so ([ADR 0009](decisions/0009-piecework-picker-attribution.md)). Since the number on it is the farm's own it is also guessable ([ADR 0011](decisions/0011-worker-numbers-are-the-farms.md)) — accepted knowingly: it identifies, it does not authenticate. The scanned number stays on every crate so a wrong attribution is visible afterwards, the supervisor at the scale sees who handed the crate over, and the office sees unplaced crates rather than silent gaps |
| A rand total is read as "this is legal to pay" | It is not, and the screen and the CSV both say so ([ADR 0010](decisions/0010-piecework-pay-boundary.md)). No hours exist for a seasonal picker, so no minimum-wage check is possible. Put it in the order form too, not only on screen |
| A card issued today is not on the scale phone's cached list | The crate saves with the raw code and the server resolves it at sync — the queue never waits on configuration (§8) |

---

## 15. Build next

1. §13 answered (ADRs 0001–0005) — proceed to Phase 1.
2. Phase 1 on one fake farm: add device → print QR → scan → one app opens → offline save → sync. **Done — exit checklist closed (§12).**
3. Notes reuse audit for `veldnotas` — **done**, see [docs/veldnotas-reuse-audit.md](veldnotas-reuse-audit.md). Build Phase 2 on the closed foundation next.
4. Phase 2 (`veldnotas`) — **done, exit checklist closed (§12).** GPS + weather stamp, offline badge, correction model. Build Phase 3 (`boord` + `eienaar`) next — check the pilot farm's season first (§12 note under Phase 3).
5. Boord + Eienaar reuse audit for Phase 3 — **done**, see [docs/boord-reuse-audit.md](boord-reuse-audit.md). Worker/team attribution closed — [ADR 0007](decisions/0007-boord-no-worker-attribution.md): dropped. Build scope ready.
6. Phase 3 (`boord` + `eienaar`) — **done, exit checklist closed (§12).** `harvest_events`, field capture screen, generalised sync, `/blocks`, and `apps/owner`'s harvest rollup. Map the pilot farm's season (§12 note) before starting Phase 4 next.
7. Phase 4 (Bekfontein go-live) — exit checklist written (§12), Excel export and CI green closed, Plaashek Management built (v1.12) so the console to create the real org/farm/entitlements now exists. Everything left is real-farm setup and on-site proving of what Phases 1–3 already built. Go-live has no calendar gate (ADR 0001, updated 17 September 2026) — ready to proceed as soon as the remaining checklist items close. **Still open** — running Phase 5 in parallel does not close any of it.
8. Phase 5 (remaining modules, §11 order) — checklist written per module (§12). `span` **done**: [build scope](span-build-scope.md), [ADR 0008](decisions/0008-span-self-clocking.md), `attendance_punches`, the clock screen, sync routing, Eienaar's hours rollup and the CSV export.
9. Seasonal piece-work **done** (out of §11's order, raised by the farm): [build scope](piecework-build-scope.md), [ADR 0009](decisions/0009-piecework-picker-attribution.md), [ADR 0010](decisions/0010-piecework-pay-boundary.md), worker cards scanned at the scale, tiered pay, the admin section and the payroll CSV. `stoor` is next — write its build scope first, same as these.

---

## 16. Naming

| Public | Means |
|---|---|
| Plaashek | Brand |
| Plaashek Management | Staff control plane |
| Farm Admin Tool | Farm office: devices and master data |
| Eienaar | Owner read module |
| Programme / app | Field module |
| Lisensie | Farm × module entitlement |
| Toestel | Field device |
| Paring-QR | Printed slip that opens one app on one phone |

---

*End of complete build plan v1.17.*
