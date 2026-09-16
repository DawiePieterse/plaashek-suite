# Seasons and record stamping

The fiddly rules, written down once so they are not re-derived per module.

## Seasons

- Farm-owned master data, edited in the Farm Admin Tool.
- `farm_id, name, starts_on, ends_on, is_active`.
- One active season per farm at a time.
- Editable — a pick runs late more often than not.
- Modules read the active season. They never define their own.

## Stamping

Every workspace row carries:

`id, farm_id, module_code, season_id, created_by, device_id, created_at,
updated_at, revoked_at, rev`

- `created_by` — the person assigned to the device at save time.
- `device_id` — which phone.
- `season_id` — resolved **on the device**, from its synced copy of the active
  season, at the moment of save.

## Why season resolves on the device

A phone can be offline for weeks. If the server resolved `season_id` at sync
time, crates captured before a season rollover would be filed under the season
that is active when the phone finally reaches signal — the wrong one.

## Season-less modules

Werkswinkel and Water leave `season_id` null rather than inventing one. Do not
default it to the active season just because one exists.

## No active season

The save still happens. The record is flagged, and the Farm Admin Tool shows
"opnames sonder seisoen" for the office to assign.

Never block a capture over a configuration screen nobody filled in.
