<?php

use Illuminate\Database\UniqueConstraintViolationException;

// Seasons, GET /farm and the farm's point, and the owner's rollups.

function seasonBody(string $name, bool $active = false): array
{
    return ['name' => $name, 'startsOn' => '2026-11-01', 'endsOn' => '2027-02-15', 'isActive' => $active];
}

it('stands the previous season down when another is activated, one active per farm', function () {
    $s = seedFarm();
    $h = bearer(staffToken($s));

    $this->postJson('/seasons', seasonBody('Oes 2025/26', true), $h)->assertOk()->assertJsonPath('season.isActive', true);
    // The unique key would refuse this if the old one did not stand down.
    $second = $this->postJson('/seasons', seasonBody('Oes 2026/27', true), $h)->assertOk()->json('season');

    expect($s['db']->table('seasons')->where('is_active', true)->pluck('name')->all())->toBe(['Oes 2026/27']);

    // Dates stay editable: a pick runs late more often than not.
    $this->patchJson("/seasons/{$second['id']}", ['endsOn' => '2027-03-31'], $h)->assertOk()->assertJsonPath('season.endsOn', '2027-03-31');

    $this->getJson('/seasons', $h)->assertOk()->assertJsonCount(2, 'seasons')->assertJsonMissingPath('seasons.0.activeMarker');
});

it('refuses a second active season at the database, not just in app code', function () {
    $s = seedFarm();
    season($s, 'Een', '2026-01-01', '2026-12-31');

    expect(fn () => season($s, 'Twee', '2027-01-01', '2027-12-31'))->toThrow(UniqueConstraintViolationException::class);
});

it('does not show or let anyone edit another farm\'s season', function () {
    $mine = seedFarm(email: 'mine@example.com');
    $theirs = seedFarm(email: 'theirs@example.com');
    $theirSeason = season($theirs, 'Hulle seisoen', '2026-01-01', '2026-12-31', false);
    $h = bearer(staffToken($mine));

    $this->getJson('/seasons', $h)->assertOk()->assertExactJson(['seasons' => []]);
    $this->patchJson("/seasons/{$theirSeason['id']}", ['name' => 'Gekaap'], $h)->assertNotFound();
});

it('returns only this farm\'s people, modules and waiting counts in GET /farm', function () {
    $mine = seedFarm(email: 'mine@example.com');
    $theirs = seedFarm(email: 'theirs@example.com');

    row($theirs['db'], 'people', ['farm_id' => $theirs['farm']['id'], 'name' => 'Ander Plaas Persoon']);
    capture($theirs, 'notes', 'veldnotas', ['body' => 'Hulle nota']);
    row($theirs['db'], 'held_writes', [
        'farm_id' => $theirs['farm']['id'], 'module_code' => 'veldnotas', 'device_id' => uuid(), 'entity' => 'notes',
        'entity_id' => uuid(), 'payload' => '{"body":"Hulle gehoue nota"}', 'client_time' => '2026-06-01 00:00:00',
    ]);
    entitle($mine['farm'], 'boord');
    entitle($mine['farm'], 'kudde', 'cancelled');
    entitle($theirs['farm'], 'stoor');

    $this->getJson('/farm', bearer(staffToken($mine)))->assertOk()
        ->assertJsonPath('farm.id', $mine['farm']['id'])
        ->assertJsonPath('farm.coords', null)
        ->assertJsonPath('people', [['id' => $mine['person']['id'], 'name' => 'Person']])
        ->assertJsonPath('modules', ['boord'])
        ->assertJsonPath('waiting', ['held' => 0, 'withoutSeason' => 0]);

    // And the other farm sees its own.
    $this->getJson('/farm', bearer(staffToken($theirs)))->assertOk()->assertJsonPath('waiting', ['held' => 1, 'withoutSeason' => 1]);
});

it('stores the farm\'s point for admin only, and GET /farm returns it', function () {
    $s = seedFarm(email: 'coords@example.com');
    $point = ['lat' => -25.569853, 'lon' => 31.605606];

    $this->putJson('/farm/coordinates', $point, bearer(staffToken($s, 'owner')))->assertForbidden();
    $this->putJson('/farm/coordinates', ['lat' => -95, 'lon' => 31.605606], bearer(staffToken($s)))->assertStatus(400);
    $this->putJson('/farm/coordinates', $point, bearer(staffToken($s)))->assertOk()->assertJsonPath('coords', $point);

    $this->getJson('/farm', bearer(staffToken($s)))->assertJsonPath('farm.coords', $point);
});

it('totals crates and kg by block for the active season only', function () {
    $s = seedFarm();
    $a = row($s['db'], 'blocks', ['farm_id' => $s['farm']['id'], 'name' => 'Blok A']);
    $b = row($s['db'], 'blocks', ['farm_id' => $s['farm']['id'], 'name' => 'Blok B']);
    $active = season($s, 'Oes 2026/27', '2026-11-01', '2027-02-15');
    $old = season($s, 'Oes 2025/26', '2025-11-01', '2026-02-15', false);

    capture($s, 'harvest_events', 'boord', ['season_id' => $active['id'], 'block_id' => $a['id'], 'weight_kg' => 10]);
    capture($s, 'harvest_events', 'boord', ['season_id' => $active['id'], 'block_id' => $a['id'], 'weight_kg' => 5]);
    capture($s, 'harvest_events', 'boord', ['season_id' => $active['id'], 'block_id' => $b['id'], 'weight_kg' => 20]);
    // Last season's crates must not bleed into this season's totals.
    capture($s, 'harvest_events', 'boord', ['season_id' => $old['id'], 'block_id' => $a['id'], 'weight_kg' => 999]);

    $this->getJson('/eienaar/harvest', bearer(staffToken($s, 'owner')))->assertOk()
        ->assertJsonPath('season.name', 'Oes 2026/27')
        ->assertJsonPath('blocks', [
            ['blockId' => $a['id'], 'blockName' => 'Blok A', 'crates' => 2, 'kg' => 15],
            ['blockId' => $b['id'], 'blockName' => 'Blok B', 'crates' => 1, 'kg' => 20],
        ]);
});

it('returns no rollup without an active season', function () {
    $h = bearer(staffToken(seedFarm()));

    $this->getJson('/eienaar/harvest', $h)->assertOk()->assertExactJson(['season' => null, 'blocks' => []]);
    $this->getJson('/eienaar/veldnotas', $h)->assertOk()->assertExactJson(['season' => null, 'total' => 0, 'notes' => []]);
    $this->getJson('/eienaar/attendance', $h)->assertOk()->assertExactJson(['season' => null, 'people' => []]);
});

it('lists the newest notes of the active season with author, block and weather', function () {
    $s = seedFarm();
    $block = row($s['db'], 'blocks', ['farm_id' => $s['farm']['id'], 'name' => 'Blok A']);
    $active = season($s, 'Oes 2026/27', '2026-11-01', '2027-02-15');
    $old = season($s, 'Oes 2025/26', '2025-11-01', '2026-02-15', false);

    capture($s, 'notes', 'veldnotas', ['season_id' => $active['id'], 'body' => 'Ou nota', 'block_id' => $block['id'], 'created_at' => '2026-11-02 06:00:00']);
    capture($s, 'notes', 'veldnotas', ['season_id' => $active['id'], 'body' => 'Nuwe nota', 'weather_temp' => 26.4, 'weather_condition' => 'clear', 'created_at' => '2026-11-03 06:00:00']);
    capture($s, 'notes', 'veldnotas', ['season_id' => $old['id'], 'body' => 'Verlede seisoen', 'created_at' => '2026-01-02 06:00:00']);

    $body = $this->getJson('/eienaar/veldnotas', bearer(staffToken($s, 'owner')))->assertOk()->json();

    expect($body['season']['name'])->toBe('Oes 2026/27')
        ->and($body['total'])->toBe(2)
        ->and(array_map(fn ($n) => [$n['body'], $n['personName'], $n['blockName'], $n['weatherTemp'], $n['weatherCondition'], $n['at']], $body['notes']))->toBe([
            ['Nuwe nota', 'Person', null, 26.4, 'clear', '2026-11-03T06:00:00.000Z'],
            ['Ou nota', 'Person', 'Blok A', null, null, '2026-11-02T06:00:00.000Z'],
        ]);
});

it('pairs punches into days and hours per person, active season only', function () {
    $s = seedFarm();
    $piet = row($s['db'], 'people', ['farm_id' => $s['farm']['id'], 'name' => 'Piet Plaas']);
    $active = season($s, 'Oes 2026/27', '2026-11-01', '2027-02-15');
    $old = season($s, 'Oes 2025/26', '2025-11-01', '2026-02-15', false);
    $punch = fn (string $person, string $direction, string $at, ?string $seasonId = null) => capture($s, 'attendance_punches', 'span', [
        'created_by' => $person, 'direction' => $direction, 'created_at' => $at, 'season_id' => $seasonId ?? $active['id'],
    ]);

    $punch($s['person']['id'], 'in', '2026-11-02 04:00:00');
    $punch($s['person']['id'], 'out', '2026-11-02 12:00:00');
    // Forgot to clock out: open, never guessed at.
    $punch($piet['id'], 'in', '2026-11-02 04:00:00');
    // Last season's hours must not bleed into this season's rollup.
    $punch($s['person']['id'], 'in', '2026-01-02 04:00:00', $old['id']);
    $punch($s['person']['id'], 'out', '2026-01-02 23:00:00', $old['id']);

    $this->getJson('/eienaar/attendance', bearer(staffToken($s, 'owner')))->assertOk()
        ->assertJsonPath('season.name', 'Oes 2026/27')
        ->assertJsonPath('people', [
            ['personId' => $s['person']['id'], 'personName' => 'Person', 'days' => 1, 'hours' => 8, 'openPunches' => 0],
            ['personId' => $piet['id'], 'personName' => 'Piet Plaas', 'days' => 0, 'hours' => 0, 'openPunches' => 1],
        ]);
});
