<?php

use App\Auth\Tickets;
use App\Support\Rows;
use Carbon\CarbonImmutable;
use Tests\TestCase;

function noteOp(string $body, string $clientTime, array $payload = []): array
{
    return ['entity' => 'notes', 'entity_id' => uuid(), 'client_time' => $clientTime, 'season_id' => null, 'payload' => ['body' => $body, ...$payload]];
}

function upload(string $ticket, array $ops)
{
    return test()->postJson('/sync/upload', ['ops' => $ops], bearer($ticket));
}

it('uploads an offline note, stamped with the farm, device and assigned person', function () {
    $p = pairedPhone('veldnotas');
    $ticket = ticketFor($p['farm'], $p['device'], ['veldnotas']);

    $response = upload($ticket, [noteOp('Luise op blok A', '2026-06-01T07:30:00.000Z')]);

    $response->assertOk()->assertJsonPath('held', false);
    $note = $p['db']->table('notes')->where('farm_id', $p['farm']['id'])->first();
    expect($note->body)->toBe('Luise op blok A')
        ->and($note->created_by)->toBe($p['person']['id'])
        ->and($note->device_id)->toBe($p['device']['id'])
        ->and($note->module_code)->toBe('veldnotas')
        // The phone's save time, not the moment it finally found signal.
        ->and(Rows::iso($note->created_at))->toBe('2026-06-01T07:30:00.000Z');
});

it('attributes to the assignment at save time, not the one at upload time', function () {
    $p = pairedPhone('veldnotas');

    // The phone changes hands after the note was taken but before it syncs.
    $second = row($p['db'], 'people', ['farm_id' => $p['farm']['id'], 'name' => 'Tweede Persoon']);
    row($p['db'], 'device_assignments', ['device_id' => $p['device']['id'], 'person_id' => $second['id'], 'assigned_by' => $p['membership']['id'], 'assigned_at' => '2026-06-02 00:00:00']);

    upload(ticketFor($p['farm'], $p['device'], ['veldnotas']), [noteOp('Voor die oorhandiging', '2026-06-01T07:30:00.000Z')])->assertOk();

    expect($p['db']->table('notes')->value('created_by'))->toBe($p['person']['id']);
});

it('refuses a revoked device, and the same note twice is one note', function () {
    $p = pairedPhone('veldnotas');
    $ticket = ticketFor($p['farm'], $p['device'], ['veldnotas']);
    $retried = noteOp('Een keer', '2026-06-01T07:30:00.000Z');

    upload($ticket, [$retried])->assertOk();
    upload($ticket, [$retried])->assertOk();
    expect($p['db']->table('notes')->count())->toBe(1);

    // Revoke drops the device's module rows: the next sync is where it bites.
    $p['db']->table('device_modules')->where('device_id', $p['device']['id'])->delete();

    upload($ticket, [$retried])->assertStatus(403)->assertJsonPath('error.code', 'not_paired');
});

it('stores block, location and weather when the phone sends them, null when it does not', function () {
    $p = pairedPhone('veldnotas');
    $with = noteOp('Luise op blok A', '2026-06-01T07:30:00.000Z', [
        'latitude' => -33.9, 'longitude' => 18.4, 'location_accuracy_m' => 12.5,
        'weather_temp' => 22.1, 'weather_humidity' => 54, 'weather_condition' => 'Clear',
    ]);

    upload(ticketFor($p['farm'], $p['device'], ['veldnotas']), [$with, noteOp('Sonder konteks', '2026-06-01T07:31:00.000Z')])->assertOk();

    $withRow = $p['db']->table('notes')->where('id', $with['entity_id'])->first();
    $withoutRow = $p['db']->table('notes')->where('id', '!=', $with['entity_id'])->first();

    expect($withRow->latitude)->toBe(-33.9)
        ->and($withRow->longitude)->toBe(18.4)
        ->and($withRow->location_accuracy_m)->toBe(12.5)
        ->and($withRow->weather_temp)->toBe(22.1)
        ->and($withRow->weather_humidity)->toEqual(54)
        ->and($withRow->weather_condition)->toBe('Clear')
        ->and($withoutRow->latitude)->toBeNull()
        ->and($withoutRow->weather_condition)->toBeNull();
});

it('holds a capture under a suspended licence instead of dropping it', function () {
    $p = pairedPhone('veldnotas', 'suspended');

    upload(ticketFor($p['farm'], $p['device'], ['veldnotas'], farmModules: []), [noteOp('Tydens die skorsing', '2026-06-01T07:30:00.000Z')])
        ->assertOk()
        ->assertJsonPath('held', true);

    expect($p['db']->table('notes')->count())->toBe(0)
        ->and($p['db']->table('held_writes')->where('farm_id', $p['farm']['id'])->count())->toBe(1);
});

it('holds a retried capture once', function () {
    $p = pairedPhone('veldnotas', 'cancelled');
    $ticket = ticketFor($p['farm'], $p['device'], ['veldnotas'], farmModules: []);
    $op = noteOp('Twee keer gestuur', '2026-06-01T07:30:00.000Z');

    upload($ticket, [$op])->assertOk();
    upload($ticket, [$op])->assertOk();

    expect($p['db']->table('held_writes')->count())->toBe(1)
        ->and(json_decode($p['db']->table('held_writes')->value('payload'), true))->toBe(['body' => 'Twee keer gestuur']);
});

it('rejects an upload with no ops, a wrong shape, or a season on a season-less module', function () {
    $p = pairedPhone('water');
    $ticket = ticketFor($p['farm'], $p['device'], ['water']);

    upload($ticket, [])->assertStatus(400)->assertJsonPath('error.code', 'validation_error');
    upload($ticket, [['entity' => 'kudde', 'entity_id' => uuid(), 'client_time' => '2026-06-01T07:30:00Z', 'season_id' => null, 'payload' => []]])->assertStatus(400);
    upload($ticket, [[
        'entity' => 'meter_readings', 'entity_id' => uuid(), 'client_time' => '2026-06-01T07:30:00Z', 'season_id' => uuid(),
        'payload' => ['water_point_id' => uuid(), 'reading' => 5],
    ]])->assertStatus(400);
});

it('answers a missing, bad or expired ticket with 401', function () {
    $p = pairedPhone('veldnotas');
    $op = [noteOp('x', '2026-06-01T07:30:00Z')];

    $this->postJson('/sync/upload', ['ops' => $op])->assertStatus(401)->assertJsonPath('error.code', 'unauthenticated');
    upload('not-a-ticket', $op)->assertStatus(401)->assertJsonPath('error.code', 'ticket_invalid');

    $old = Tickets::mint(TestCase::keys(), $p['farm']['id'], $p['device']['id'], ['veldnotas'], ['veldnotas'], 'af', null, CarbonImmutable::now()->subDays(22));
    upload($old, $op)->assertStatus(401)->assertJsonPath('error.code', 'ticket_expired');
});
