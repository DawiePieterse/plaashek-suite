<?php

use App\Support\Rows;

// The per-module sync tests: Boord, Span, Stoor, Water, Werkswinkel. Each one uploads, dedupes a retry,
// refuses a phone paired for another module, and holds under a suspended licence.

/** A paired phone plus one catalog row its captures point at. */
function phoneWith(string $module, string $status = 'active'): array
{
    $p = pairedPhone($module, $status);
    $farmId = $p['farm']['id'];

    return [...$p,
        'block' => row($p['db'], 'blocks', ['farm_id' => $farmId, 'name' => 'Blok A']),
        'item' => row($p['db'], 'stock_items', ['farm_id' => $farmId, 'name' => 'Glifosaat', 'unit' => 'L']),
        'point' => row($p['db'], 'water_points', ['farm_id' => $farmId, 'name' => 'Boorgat 1', 'unit' => 'm³']),
        'asset' => row($p['db'], 'assets', ['farm_id' => $farmId, 'name' => 'Trekker']),
        'ticket' => ticketFor($p['farm'], $p['device'], [$module], $status === 'active' ? null : []),
    ];
}

it('uploads a crate, stamped with block, weight and the assigned person', function () {
    $p = phoneWith('boord');

    upload($p['ticket'], [op('harvest_events', ['block_id' => $p['block']['id'], 'weight_kg' => 18.5, 'deduction_kg' => 0.5, 'weather_temp' => 21, 'weather_humidity' => 60, 'weather_condition' => 'Clear'])])
        ->assertOk()->assertJsonPath('held', false);

    $row = $p['db']->table('harvest_events')->first();
    expect($row->block_id)->toBe($p['block']['id'])
        ->and($row->weight_kg)->toBe(18.5)
        ->and($row->deduction_kg)->toBe(0.5)
        ->and($row->created_by)->toBe($p['person']['id'])
        ->and($row->module_code)->toBe('boord');
});

it('refuses a crate from a phone paired for veldnotas', function () {
    $p = phoneWith('veldnotas');

    upload($p['ticket'], [op('harvest_events', ['block_id' => $p['block']['id'], 'weight_kg' => 10])])
        ->assertForbidden()->assertJsonPath('error.code', 'not_paired');
});

it('holds a crate under a suspended Boord licence', function () {
    $p = phoneWith('boord', 'suspended');

    upload($p['ticket'], [op('harvest_events', ['block_id' => $p['block']['id'], 'weight_kg' => 10])])->assertOk()->assertJsonPath('held', true);
    expect($p['db']->table('harvest_events')->count())->toBe(0);
});

it('uploads punches with the direction and the device\'s person, at the punch\'s own time', function () {
    $p = phoneWith('span');
    $gps = ['latitude' => -25.75, 'longitude' => 28.23, 'location_accuracy_m' => 12];

    upload($p['ticket'], [
        op('attendance_punches', ['direction' => 'in', ...$gps], '2026-06-01T04:12:00.000Z'),
        op('attendance_punches', ['direction' => 'out', ...$gps], '2026-06-01T14:03:00.000Z'),
    ])->assertOk()->assertJsonPath('held', false);

    $rows = $p['db']->table('attendance_punches')->orderBy('created_at')->get();
    expect($rows->pluck('direction')->all())->toBe(['in', 'out'])
        ->and($rows[0]->created_by)->toBe($p['person']['id'])
        ->and($rows[0]->module_code)->toBe('span')
        ->and($rows[0]->latitude)->toBe(-25.75)
        ->and(Rows::iso($rows[0]->created_at))->toBe('2026-06-01T04:12:00.000Z');
});

it('accepts a second in rather than arguing, and lands a retried punch once', function () {
    $p = phoneWith('span');
    $retried = op('attendance_punches', ['direction' => 'in'], '2026-06-01T04:12:00.000Z');

    upload($p['ticket'], [$retried, op('attendance_punches', ['direction' => 'in'], '2026-06-01T04:13:00.000Z')])->assertOk();
    upload($p['ticket'], [$retried])->assertOk();

    expect($p['db']->table('attendance_punches')->count())->toBe(2);
});

it('refuses a punch from a boord phone and holds one under a suspended Span licence', function () {
    upload(phoneWith('boord')['ticket'], [op('attendance_punches', ['direction' => 'in'])])->assertForbidden()->assertJsonPath('error.code', 'not_paired');

    $held = phoneWith('span', 'suspended');
    upload($held['ticket'], [op('attendance_punches', ['direction' => 'in'])])->assertOk()->assertJsonPath('held', true);
    expect($held['db']->table('attendance_punches')->count())->toBe(0);
});

it('uploads stock moves with direction, quantity and note', function () {
    $p = phoneWith('stoor');

    upload($p['ticket'], [
        op('stock_moves', ['item_id' => $p['item']['id'], 'direction' => 'in', 'quantity' => 20]),
        op('stock_moves', ['item_id' => $p['item']['id'], 'direction' => 'out', 'quantity' => 5, 'note' => 'Blok A']),
    ])->assertOk()->assertJsonPath('held', false);

    $rows = $p['db']->table('stock_moves')->get();
    expect($rows)->toHaveCount(2)
        ->and($rows[0]->created_by)->toBe($p['person']['id'])
        ->and($rows[0]->module_code)->toBe('stoor')
        ->and($rows[0]->item_id)->toBe($p['item']['id'])
        ->and($rows->firstWhere('direction', 'out')->note)->toBe('Blok A');
});

it('lands a retried move once, refuses one from a span phone, holds one under suspension', function () {
    $p = phoneWith('stoor');
    $move = op('stock_moves', ['item_id' => $p['item']['id'], 'direction' => 'in', 'quantity' => 10]);
    upload($p['ticket'], [$move])->assertOk();
    upload($p['ticket'], [$move])->assertOk();
    expect($p['db']->table('stock_moves')->count())->toBe(1);

    $span = phoneWith('span');
    upload($span['ticket'], [op('stock_moves', ['item_id' => $span['item']['id'], 'direction' => 'in', 'quantity' => 10])])->assertForbidden();

    $held = phoneWith('stoor', 'suspended');
    upload($held['ticket'], [op('stock_moves', ['item_id' => $held['item']['id'], 'direction' => 'out', 'quantity' => 3])])->assertOk()->assertJsonPath('held', true);
    expect($held['db']->table('stock_moves')->count())->toBe(0);
});

it('uploads a reading, season always null', function () {
    $p = phoneWith('water');

    upload($p['ticket'], [op('meter_readings', ['water_point_id' => $p['point']['id'], 'reading' => 1200, 'note' => 'Maandelikse lesing'])])
        ->assertOk()->assertJsonPath('held', false);

    $row = $p['db']->table('meter_readings')->first();
    expect($row->created_by)->toBe($p['person']['id'])
        ->and($row->module_code)->toBe('water')
        ->and($row->water_point_id)->toBe($p['point']['id'])
        ->and($row->reading)->toEqual(1200)
        ->and($row->season_id)->toBeNull()
        ->and($row->note)->toBe('Maandelikse lesing');
});

it('lands a retried reading once, refuses one from a stoor phone, holds one under suspension', function () {
    $p = phoneWith('water');
    $reading = op('meter_readings', ['water_point_id' => $p['point']['id'], 'reading' => 1200]);
    upload($p['ticket'], [$reading])->assertOk();
    upload($p['ticket'], [$reading])->assertOk();
    expect($p['db']->table('meter_readings')->count())->toBe(1);

    $stoor = phoneWith('stoor');
    upload($stoor['ticket'], [op('meter_readings', ['water_point_id' => $stoor['point']['id'], 'reading' => 1200])])->assertForbidden()->assertJsonPath('error.code', 'not_paired');

    $held = phoneWith('water', 'suspended');
    upload($held['ticket'], [op('meter_readings', ['water_point_id' => $held['point']['id'], 'reading' => 1200])])->assertOk()->assertJsonPath('held', true);
    expect($held['db']->table('meter_readings')->count())->toBe(0);
});

it('uploads opening and closing a job as two rows, season always null', function () {
    $p = phoneWith('werkswinkel');

    upload($p['ticket'], [
        op('work_orders', ['asset_id' => $p['asset']['id'], 'event' => 'opened', 'description' => 'Band pap'], '2026-06-01T04:00:00.000Z'),
        op('work_orders', ['asset_id' => $p['asset']['id'], 'event' => 'closed', 'description' => 'Nuwe band'], '2026-06-01T10:00:00.000Z'),
    ])->assertOk()->assertJsonPath('held', false);

    $rows = $p['db']->table('work_orders')->orderBy('created_at')->get();
    expect($rows)->toHaveCount(2)
        ->and($rows[0]->created_by)->toBe($p['person']['id'])
        ->and($rows[0]->module_code)->toBe('werkswinkel')
        ->and($rows[0]->season_id)->toBeNull()
        ->and($rows->map(fn ($r) => [$r->event, $r->description])->all())->toBe([['opened', 'Band pap'], ['closed', 'Nuwe band']]);
});

it('uploads a fuel log with asset and litres', function () {
    $p = phoneWith('werkswinkel');

    upload($p['ticket'], [op('fuel_logs', ['asset_id' => $p['asset']['id'], 'litres' => 45.5, 'meter_reading' => 12345])])->assertOk();

    $row = $p['db']->table('fuel_logs')->first();
    expect($row->created_by)->toBe($p['person']['id'])
        ->and($row->litres)->toBe(45.5)
        ->and($row->meter_reading)->toEqual(12345)
        ->and($row->season_id)->toBeNull();
});

it('lands a retried job event once, refuses one from a stoor phone, holds both entities under suspension', function () {
    $p = phoneWith('werkswinkel');
    $opened = op('work_orders', ['asset_id' => $p['asset']['id'], 'event' => 'opened', 'description' => 'Band pap']);
    upload($p['ticket'], [$opened])->assertOk();
    upload($p['ticket'], [$opened])->assertOk();
    expect($p['db']->table('work_orders')->count())->toBe(1);

    $stoor = phoneWith('stoor');
    upload($stoor['ticket'], [op('work_orders', ['asset_id' => $stoor['asset']['id'], 'event' => 'opened'])])->assertForbidden()->assertJsonPath('error.code', 'not_paired');

    $held = phoneWith('werkswinkel', 'suspended');
    upload($held['ticket'], [
        op('work_orders', ['asset_id' => $held['asset']['id'], 'event' => 'opened']),
        op('fuel_logs', ['asset_id' => $held['asset']['id'], 'litres' => 10]),
    ])->assertOk()->assertJsonPath('held', true);
    expect($held['db']->table('work_orders')->count())->toBe(0)
        ->and($held['db']->table('fuel_logs')->count())->toBe(0)
        ->and($held['db']->table('held_writes')->count())->toBe(2);
});

it('refuses a capture pointing at another farm\'s block, and leaves nothing behind', function () {
    $p = phoneWith('boord');
    $other = seedFarm();
    $foreignBlock = row($other['db'], 'blocks', ['farm_id' => $other['farm']['id'], 'name' => 'Nie joune nie']);

    upload($p['ticket'], [op('harvest_events', ['block_id' => $foreignBlock['id'], 'weight_kg' => 10])])->assertStatus(500);

    expect($p['db']->table('harvest_events')->count())->toBe(0)
        ->and($other['db']->table('harvest_events')->count())->toBe(0);
});

it('lists only this farm\'s blocks to the phone, alphabetical', function () {
    $mine = seedFarm(email: 'mine@example.com');
    $theirs = seedFarm(email: 'theirs@example.com');
    row($mine['db'], 'blocks', ['farm_id' => $mine['farm']['id'], 'name' => 'Blok B']);
    row($mine['db'], 'blocks', ['farm_id' => $mine['farm']['id'], 'name' => 'Blok A']);
    row($theirs['db'], 'blocks', ['farm_id' => $theirs['farm']['id'], 'name' => 'Ander Plaas se Blok']);

    $ticket = ticketFor($mine['farm'], ['id' => uuid()], ['boord']);

    expect(collect($this->getJson('/blocks', bearer($ticket))->assertOk()->json('blocks'))->pluck('name')->all())->toBe(['Blok A', 'Blok B']);
});
