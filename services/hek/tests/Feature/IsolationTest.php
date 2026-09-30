<?php

use App\Farm\FarmDatabase;
use Illuminate\Support\Facades\Route;

// ADR 0015: each farm's data lives in its own database, so a request can only ever reach the farm its
// session, ticket or pairing token names, even through a query that forgets to filter by farm.

beforeEach(function () {
    // Deliberately careless routes: no farm_id filter anywhere.
    Route::middleware(['api', 'staff:admin,owner'])->get('/__all-notes', fn (FarmDatabase $farm) => ['bodies' => $farm->db()->table('notes')->orderBy('body')->pluck('body')]);
    Route::middleware(['api', 'device'])->get('/__all-people', fn (FarmDatabase $farm) => ['names' => $farm->db()->table('people')->orderBy('name')->pluck('name')]);
    Route::middleware('api')->get('/__no-farm', fn (FarmDatabase $farm) => ['count' => $farm->db()->table('notes')->count()]);
});

it('keeps each farm in its own database', function () {
    $a = seedFarm();
    $b = seedFarm();

    expect($a['db']->getDatabaseName())->toBe('plaashek_test_f_farm')
        ->and($b['db']->getDatabaseName())->toBe('plaashek_test_f_farm2')
        ->and($a['db']->table('people')->pluck('id')->all())->toBe([$a['person']['id']])
        ->and($b['db']->table('people')->pluck('id')->all())->toBe([$b['person']['id']]);
});

it('shows a staff session only its own farm, even through a query with no farm filter', function () {
    $a = seedFarm();
    $b = seedFarm();
    capture($a, 'notes', 'veldnotas', ['body' => 'A se nota']);
    capture($b, 'notes', 'veldnotas', ['body' => 'B se nota']);

    $this->getJson('/__all-notes', bearer(staffToken($a)))->assertOk()->assertExactJson(['bodies' => ['A se nota']]);
    $this->getJson('/__all-notes', bearer(staffToken($b)))->assertOk()->assertExactJson(['bodies' => ['B se nota']]);
});

it('shows a device ticket only its own farm, even through a query with no farm filter', function () {
    $a = pairedPhone('veldnotas');
    $b = seedFarm();
    row($b['db'], 'people', ['farm_id' => $b['farm']['id'], 'name' => 'B se werker']);

    $this->getJson('/__all-people', bearer(ticketFor($a['farm'], $a['device'], ['veldnotas'])))->assertOk()->assertExactJson(['names' => ['Person']]);
});

it('starts every request with no farm chosen, so nothing carries over', function () {
    $a = seedFarm();
    capture($a, 'notes', 'veldnotas', ['body' => 'A se nota']);

    $this->getJson('/__all-notes', bearer(staffToken($a)))->assertOk();

    // The next request has no session: it must not find farm A still chosen.
    $this->getJson('/__no-farm')->assertStatus(500);
    expect(fn () => app(FarmDatabase::class)->db())->toThrow(LogicException::class);
});

it('switches cleanly between farms from one request to the next', function () {
    $farms = [seedFarm(), seedFarm(), seedFarm()];
    foreach ($farms as $i => $s) {
        capture($s, 'notes', 'veldnotas', ['body' => "nota {$i}"]);
    }

    foreach ([0, 2, 1, 0, 1] as $i) {
        $this->getJson('/__all-notes', bearer(staffToken($farms[$i])))->assertOk()->assertExactJson(['bodies' => ["nota {$i}"]]);
    }
});

it('gives one farm\'s staff a 404 for another farm\'s ids on every edit route', function () {
    $a = seedFarm();
    $b = pairedPhone('boord');
    $h = bearer(staffToken($a));
    $bId = fn (string $table, array $values) => row($b['db'], $table, ['farm_id' => $b['farm']['id'], ...$values])['id'];

    $token = row($b['db'], 'pairing_tokens', ['device_id' => $b['device']['id'], 'module_code' => 'boord', 'token' => 'farm2.x', 'printed_by' => $b['membership']['id'], 'expires_at' => now()->addDay()->format('Y-m-d H:i:s')]);

    $this->postJson("/devices/{$b['device']['id']}/revoke", [], $h)->assertNotFound();
    $this->postJson("/pairing-tokens/{$token['id']}/cancel", [], $h)->assertNotFound();
    $this->postJson("/pairing-tokens/{$token['id']}/reprint", [], $h)->assertNotFound();
    $this->patchJson('/seasons/'.$bId('seasons', ['name' => 'S', 'starts_on' => '2026-01-01', 'ends_on' => '2026-02-01']), ['name' => 'x'], $h)->assertNotFound();
    $this->patchJson('/stock-items/'.$bId('stock_items', ['name' => 'I', 'unit' => 'L']), ['active' => false], $h)->assertNotFound();
    $this->patchJson('/water-points/'.$bId('water_points', ['name' => 'P', 'unit' => 'm']), ['active' => false], $h)->assertNotFound();
    $this->patchJson("/piecework/workers/{$b['person']['id']}", ['name' => 'x'], $h)->assertNotFound();

    expect($b['db']->table('device_modules')->count())->toBe(1)
        ->and($b['db']->table('pairing_tokens')->whereNull('cancelled_at')->count())->toBe(1);
});
