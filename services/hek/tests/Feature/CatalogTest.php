<?php

// Stoor and Water catalogs, their phone copies and owner rollups; Werkswinkel's lists.

it('lets admin add and edit a stock item; owner reads but cannot create', function () {
    $s = seedFarm();
    $admin = bearer(staffToken($s, 'admin'));
    $owner = bearer(staffToken($s, 'owner'));

    $itemId = $this->postJson('/stock-items', ['name' => 'Glifosaat', 'unit' => 'L'], $admin)->assertOk()->json('item.id');

    // Retiring leaves the id alone: moves already logged keep pointing at the same item.
    $this->patchJson("/stock-items/{$itemId}", ['active' => false], $admin)->assertOk()
        ->assertJsonPath('item.active', false)
        ->assertJsonPath('item.name', 'Glifosaat');

    $this->getJson('/stock-items', $owner)->assertOk()->assertJsonPath('items.0.active', false);
    $this->postJson('/stock-items', ['name' => 'Kunsmis', 'unit' => 'kg'], $owner)->assertForbidden();
    $this->patchJson("/stock-items/{$itemId}", [], $admin)->assertStatus(400);
});

it('cannot edit another farm\'s stock item or water point', function () {
    $mine = seedFarm(email: 'mine@example.com');
    $theirs = seedFarm(email: 'theirs@example.com');
    $item = row($theirs['db'], 'stock_items', ['farm_id' => $theirs['farm']['id'], 'name' => 'Hulle item', 'unit' => 'L']);
    $point = row($theirs['db'], 'water_points', ['farm_id' => $theirs['farm']['id'], 'name' => 'Hulle punt', 'unit' => 'm³']);

    $this->patchJson("/stock-items/{$item['id']}", ['active' => false], bearer(staffToken($mine)))->assertNotFound();
    $this->patchJson("/water-points/{$point['id']}", ['active' => false], bearer(staffToken($mine)))->assertNotFound();
    $this->patchJson('/water-points/not-a-uuid', ['active' => false], bearer(staffToken($mine)))->assertNotFound();
});

it('gives a paired phone only the active stock items', function () {
    $p = pairedPhone('stoor');
    row($p['db'], 'stock_items', ['farm_id' => $p['farm']['id'], 'name' => 'Glifosaat', 'unit' => 'L', 'active' => true]);
    row($p['db'], 'stock_items', ['farm_id' => $p['farm']['id'], 'name' => 'Ou voorraad', 'unit' => 'bag', 'active' => false]);

    $this->getJson('/stock-catalog', bearer(ticketFor($p['farm'], $p['device'], ['stoor'])))
        ->assertOk()
        ->assertExactJson(['items' => [['id' => $p['db']->table('stock_items')->where('active', true)->value('id'), 'name' => 'Glifosaat', 'unit' => 'L']]]);
});

it('sums stock on hand across every season, not just the active one', function () {
    $s = seedFarm();
    $item = row($s['db'], 'stock_items', ['farm_id' => $s['farm']['id'], 'name' => 'Glifosaat', 'unit' => 'L']);
    $old = season($s, 'Oes 2025', '2025-01-01', '2025-12-31', false);
    $active = season($s, 'Oes 2026', '2026-01-01', '2026-12-31');

    capture($s, 'stock_moves', 'stoor', ['item_id' => $item['id'], 'season_id' => $old['id'], 'direction' => 'in', 'quantity' => 100]);
    capture($s, 'stock_moves', 'stoor', ['item_id' => $item['id'], 'season_id' => $old['id'], 'direction' => 'out', 'quantity' => 30]);
    capture($s, 'stock_moves', 'stoor', ['item_id' => $item['id'], 'season_id' => $active['id'], 'direction' => 'out', 'quantity' => 20]);

    $this->getJson('/eienaar/stock', bearer(staffToken($s, 'owner')))->assertOk()
        ->assertJsonPath('items.0.itemId', $item['id'])
        ->assertJsonPath('items.0.onHand', 50);
});

it('lets admin add and edit a water point; owner reads but cannot create', function () {
    $s = seedFarm();
    $admin = bearer(staffToken($s, 'admin'));
    $owner = bearer(staffToken($s, 'owner'));

    $pointId = $this->postJson('/water-points', ['name' => 'Boorgat 1', 'unit' => 'm³'], $admin)->assertOk()->json('point.id');
    $this->patchJson("/water-points/{$pointId}", ['active' => false], $admin)->assertOk()->assertJsonPath('point.active', false);

    $this->getJson('/water-points', $owner)->assertOk()->assertJsonPath('points.0.active', false);
    $this->postJson('/water-points', ['name' => 'Dam Suid', 'unit' => 'm'], $owner)->assertForbidden();
});

it('gives a paired phone only the active water points', function () {
    $p = pairedPhone('water');
    row($p['db'], 'water_points', ['farm_id' => $p['farm']['id'], 'name' => 'Boorgat 1', 'unit' => 'm³', 'active' => true]);
    row($p['db'], 'water_points', ['farm_id' => $p['farm']['id'], 'name' => 'Ou dam', 'unit' => 'm', 'active' => false]);

    expect(collect($this->getJson('/water-catalog', bearer(ticketFor($p['farm'], $p['device'], ['water'])))->assertOk()->json('points'))->pluck('name')->all())
        ->toBe(['Boorgat 1']);
});

it('reports the latest reading and its change from the one before, negative too', function () {
    $s = seedFarm();
    $rising = row($s['db'], 'water_points', ['farm_id' => $s['farm']['id'], 'name' => 'Boorgat 1', 'unit' => 'm³']);
    $dropping = row($s['db'], 'water_points', ['farm_id' => $s['farm']['id'], 'name' => 'Dam', 'unit' => 'm']);
    $once = row($s['db'], 'water_points', ['farm_id' => $s['farm']['id'], 'name' => 'Enkel', 'unit' => 'm³']);

    capture($s, 'meter_readings', 'water', ['water_point_id' => $rising['id'], 'reading' => 1000, 'created_at' => '2026-05-01 00:00:00']);
    capture($s, 'meter_readings', 'water', ['water_point_id' => $rising['id'], 'reading' => 1250, 'created_at' => '2026-06-01 00:00:00']);
    // A replaced meter, or a dam that dropped: the number is trusted, not corrected.
    capture($s, 'meter_readings', 'water', ['water_point_id' => $dropping['id'], 'reading' => 1000, 'created_at' => '2026-05-01 00:00:00']);
    capture($s, 'meter_readings', 'water', ['water_point_id' => $dropping['id'], 'reading' => 20, 'created_at' => '2026-06-01 00:00:00']);
    capture($s, 'meter_readings', 'water', ['water_point_id' => $once['id'], 'reading' => 500]);

    $points = collect($this->getJson('/eienaar/water', bearer(staffToken($s, 'owner')))->assertOk()->json('points'))->keyBy('name');

    expect($points['Boorgat 1'])->toMatchArray(['latestReading' => 1250, 'delta' => 250, 'latestAt' => '2026-06-01T00:00:00.000Z'])
        ->and($points['Dam'])->toMatchArray(['latestReading' => 20, 'delta' => -980])
        ->and($points['Enkel'])->toMatchArray(['latestReading' => 500, 'delta' => null]);
});

it('gives a paired phone the farm\'s assets', function () {
    $p = pairedPhone('werkswinkel');
    row($p['db'], 'assets', ['farm_id' => $p['farm']['id'], 'name' => 'Trekker']);
    row($p['db'], 'assets', ['farm_id' => $p['farm']['id'], 'name' => 'Pakhuis']);

    expect(collect($this->getJson('/assets', bearer(ticketFor($p['farm'], $p['device'], ['werkswinkel'])))->assertOk()->json('assets'))->pluck('name')->all())
        ->toBe(['Pakhuis', 'Trekker']);
});

it('shows any paired phone the open jobs, not just the one that opened them', function () {
    $p = pairedPhone('werkswinkel');
    $asset = row($p['db'], 'assets', ['farm_id' => $p['farm']['id'], 'name' => 'Trekker']);
    capture($p, 'work_orders', 'werkswinkel', ['asset_id' => $asset['id'], 'event' => 'opened', 'description' => 'Band pap']);

    $secondPhone = row($p['db'], 'devices', ['farm_id' => $p['farm']['id']]);

    $this->getJson('/work-orders/open', bearer(ticketFor($p['farm'], $secondPhone, ['werkswinkel'])))->assertOk()
        ->assertJsonCount(1, 'jobs')
        ->assertJsonPath('jobs.0.description', 'Band pap');
});

it('groups open jobs by asset for the office and leaves closed ones out', function () {
    $p = pairedPhone('werkswinkel');
    $trekker = row($p['db'], 'assets', ['farm_id' => $p['farm']['id'], 'name' => 'Trekker']);
    $pomp = row($p['db'], 'assets', ['farm_id' => $p['farm']['id'], 'name' => 'Waterpomp']);

    capture($p, 'work_orders', 'werkswinkel', ['asset_id' => $trekker['id'], 'event' => 'opened', 'description' => 'Band pap', 'created_at' => '2026-06-01 04:00:00']);
    capture($p, 'work_orders', 'werkswinkel', ['asset_id' => $trekker['id'], 'event' => 'closed', 'created_at' => '2026-06-01 10:00:00']);
    capture($p, 'work_orders', 'werkswinkel', ['asset_id' => $pomp['id'], 'event' => 'opened', 'description' => 'Pomp lek', 'created_at' => '2026-06-02 04:00:00']);

    $this->getJson('/eienaar/werkswinkel', bearer(staffToken($p, 'owner')))->assertOk()
        ->assertExactJson(['assets' => [['assetId' => $pomp['id'], 'assetName' => 'Waterpomp', 'jobs' => [['description' => 'Pomp lek', 'openedAt' => '2026-06-02T04:00:00.000Z']]]]]);
});

it('lets admin and owner create a person, block, camp and asset, and GET /farm lists them', function () {
    $s = seedFarm();
    $admin = bearer(staffToken($s, 'admin'));

    $this->postJson('/people', ['name' => 'Petrus'], $admin)->assertOk()
        ->assertJsonPath('person.name', 'Petrus')
        ->assertJsonPath('person.farmId', $s['farm']['id']);
    $blockId = $this->postJson('/blocks', ['name' => 'Blok A'], $admin)->assertOk()->assertJsonPath('block.name', 'Blok A')->json('block.id');
    $this->postJson('/camps', ['name' => 'Kamp 1', 'blockId' => $blockId], $admin)->assertOk()->assertJsonPath('camp.blockId', $blockId);
    $this->postJson('/assets', ['name' => 'Trekker'], $admin)->assertOk()->assertJsonPath('asset.name', 'Trekker');

    // The owner has the same rights as admin here.
    $this->postJson('/people', ['name' => 'Owner Toets'], bearer(staffToken($s, 'owner')))->assertOk();

    $farm = $this->getJson('/farm', $admin)->assertOk()->json();
    expect(collect($farm['people'])->pluck('name')->sort()->values()->all())->toBe(['Owner Toets', 'Person', 'Petrus'])
        ->and(collect($farm['blocks'])->pluck('name')->all())->toBe(['Blok A'])
        ->and(collect($farm['camps'])->pluck('name')->all())->toBe(['Kamp 1'])
        ->and(collect($farm['assets'])->pluck('name')->all())->toBe(['Trekker']);
});

it('will not let a camp claim another farm\'s block', function () {
    $mine = seedFarm(email: 'mine@example.com');
    $theirs = seedFarm(email: 'theirs@example.com');
    $theirBlock = row($theirs['db'], 'blocks', ['farm_id' => $theirs['farm']['id'], 'name' => 'Hulle blok']);

    $this->postJson('/camps', ['name' => 'Gekaapte kamp', 'blockId' => $theirBlock['id']], bearer(staffToken($mine)))->assertNotFound();
    expect($mine['db']->table('camps')->count())->toBe(0);
});

it('keeps people, blocks and camps farm-scoped in GET /farm', function () {
    $mine = seedFarm(email: 'mine@example.com');
    $theirs = seedFarm(email: 'theirs@example.com');
    row($theirs['db'], 'people', ['farm_id' => $theirs['farm']['id'], 'name' => 'Hulle persoon']);
    row($theirs['db'], 'blocks', ['farm_id' => $theirs['farm']['id'], 'name' => 'Hulle blok']);

    $body = $this->getJson('/farm', bearer(staffToken($mine)))->assertOk()->json();
    expect(collect($body['people'])->pluck('id')->all())->toBe([$mine['person']['id']])
        ->and($body['blocks'])->toBe([])
        ->and($body['camps'])->toBe([]);
});
