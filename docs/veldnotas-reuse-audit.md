# Veldnotas reuse audit

**Date:** 17 September 2026
**Status:** audit — kicks off Phase 2 (plan §15 point 3)
**Reference app:** `../BoordNotes` (sibling repo, not this monorepo) — FastAPI +
SQLModel backend, vanilla-JS PWA frontend, IndexedDB outbox, login already
stripped out.

Plan §1 / README: reference apps are reuse-a-screen-or-shape-if-it-fits,
otherwise rebuild. This audit checks BoordNotes feature by feature against
what Phase 1 already built and locked in: append-only `notes` table
(`packages/schema/src/tables/notes.ts`), `onConflictDoNothing` insert with no
update path (`services/api/src/routes/sync.ts`), and a text-only localStorage
outbox (`apps/field/src/queue.ts`, `Notes.tsx`).

## Straight reuse

| Feature | Reference shape | Verdict |
|---|---|---|
| GPS stamp | `latitude, longitude, location_accuracy_m`, warmed up on screen-open, captured once at creation only, save never blocked on a fix | Port as-is. Add the three columns to `notes`; port `requestLocationFix`/`freshFix` logic. |
| Weather stamp | `weather_temp, weather_humidity, weather_condition`, server-proxied lookup, 1.5s client-side race against a blank result, only attempted online | Port as-is. Needs a new `/weather/current` route (nothing like it exists in `services/api` yet) and the three columns. |
| Offline/unsynced UX | Badge showing queued count; toast + tone on local save; save never waits on network | Port the pattern. `Notes.tsx` already has the queue count; add the badge/toast. |
| Sync-loop shape | Flush on mount + `online` event, plus a 10s poll interval; entries before photos so a photo's parent exists; never throws, silently retries | `Notes.tsx`/`queue.ts` already do mount + online. Add the 10s poll — a phone that regains signal mid-screen with the event not firing (flaky rural radios) still catches up. |
| Search filtering | Lowercased substring match in application code, not SQL `LIKE` | Port the reasoning, not the code: SQLite's `LIKE` is ASCII-only and mishandles `ë`/`é` in dictated Afrikaans notes. Same problem will hit Postgres `ILIKE` under farm-language search — filter in code or use a collation-aware query. |
| Login/accounts | Already fully stripped (`models.User` is vestigial, kept only so old rows' author still resolves) | Nothing to port — new model already matches (`created_by` stamped from `device_assignments`, no per-note author field needed). |

## Conflicts with what Phase 1 already locked in

The reference app supports **in-place edit** (`upsert_entry` overwrites title/
body/block, preserves `created_at`) and **soft-delete/archive**
(`Entry.archived`, restorable). `services/api/src/routes/sync.ts` already
built notes as pure append-only — `onConflictDoNothing`, no update branch —
matching plan §7 ("append-only for events... conflicting edits: keep both,
flag the office"). Edit and archive do not fit that model as built.

This needed a decision, not a silent port — now closed:

- **Correction model and delete/archive** — [ADR 0006](decisions/0006-note-corrections.md):
  no edit, no delete. A mistake is corrected by capturing a new note, same as
  any other append-only event. Formalizes what `services/api/src/routes/sync.ts`
  already does (no update path); nothing to build.

The reference's entries-list reconciliation logic (a locally-cached synced
entry missing from an unfiltered server response = archived elsewhere, so
drop the local copy) exists only because entries *can* disappear. Under
append-only, nothing to reconcile — skip that logic, don't port it.

## Needs a product call before building

| Feature | Reference shape | Question |
|---|---|---|
| Photos | Separate `Photo` table, client-downscaled to JPEG, own upload endpoint, uploaded lazily after the parent entry syncs | Matches plan §7's lazy photo channel conceptually, but `queue.ts` is explicitly localStorage (`ponytail: ... wrong for photos`) and Phase 2's exit bar (plan §12) only requires "offline note survives" — text. Recommend: **out of Phase 2 exit scope**, first candidate for Phase 2 follow-up once a local blob store (IndexedDB, like the reference's `idb.js`) is in place. |
| Tags | Global `Tag` table + link table, autocomplete, usage counts, delete-when-unused | No tags table exists yet. Reusable shape if wanted, but adds a second entity + two endpoints for something the Phase 2 exit checklist doesn't ask for. Recommend: **defer**, confirm if the pilot farm actually wants it. |
| Block | Free-text field (`block: str`, deliberately not an FK, per the reference's own comment) | The new schema already has a real `blocks` master-data table (plan §4.2) that BoordNotes never had. Recommend **`block_id` FK now**, not free text — the reference's reason for free text (no blocks table existed) no longer applies here. |
| Dashboard/stats screen | Total / this-week / with-photos / tags-used / recent, merged with this device's unsynced entries so nothing looks lost while offline | Good pattern, but depends on tags + photos being in scope first. Defer with them. |
| Backups screen | Per-install SQLite zip download | Not needed — superseded by the platform-level nightly Postgres backup already scoped in `infra/backup` (plan §10). Don't port. |

## Recommended Phase 2 build scope

Matches the plan's actual exit bar ("offline note survives; farm without the
entitlement cannot pair that QR") rather than reference-app parity:

1. `notes` table: add `block_id` (FK to blocks), `latitude`, `longitude`,
   `location_accuracy_m`, `weather_temp`, `weather_humidity`,
   `weather_condition`. Keep `body` as-is, append-only.
2. `Notes.tsx`: block picker, GPS warm-up + stamp, weather stamp via a new
   `/weather/current` proxy route, offline badge, 10s poll added to the
   existing flush-on-mount/online logic.
   **Amendment, 17 September 2026:** block picker dropped before shipping —
   GPS already places the note, so a manual block field would ask the worker
   to say the same thing twice. `notes.block_id` stays in the schema, just
   not captured from this screen.
3. Correction model closed — [ADR 0006](decisions/0006-note-corrections.md).
4. Tags, photos, dashboard/stats: not in this phase — listed above as the
   next candidates once there's a real local blob store for photos.
