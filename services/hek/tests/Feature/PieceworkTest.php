<?php

use Illuminate\Testing\TestResponse;

/** A farm mid-pick: an active season, a block, and a Boord phone at the scale. */
function pickingFarm(): array
{
    $p = pairedPhone('boord');

    return [...$p,
        'block' => row($p['db'], 'blocks', ['farm_id' => $p['farm']['id'], 'name' => 'Blok A']),
        'season' => season($p, 'Lietsjie 2026', '2026-09-01', '2026-12-31'),
    ];
}

/** The office types the number; every test that needs a picker starts here. */
function registerWorker(array $s, string $number, string $name): TestResponse
{
    return test()->postJson('/piecework/workers', ['workerNumber' => $number, 'name' => $name], bearer(staffToken($s)));
}

function crateOp(array $s, float $kg, ?string $card = null): array
{
    return op('harvest_events', ['block_id' => $s['block']['id'], 'weight_kg' => $kg, 'picker_card_code' => $card], '2026-09-10T07:30:00.000Z', $s['season']['id']);
}

it('registers a seasonal worker under the number the office typed', function () {
    $s = pickingFarm();

    // Typed with a stray space and lower case, as it would be off a payslip.
    registerWorker($s, ' emp-014 ', 'Sara Sithole')->assertOk()
        ->assertJsonPath('person.workerNumber', 'EMP014')
        ->assertJsonPath('person.kind', 'seasonal');

    // Seasonal people stay out of the device-assignment list.
    expect(collect($this->getJson('/farm', bearer(staffToken($s)))->json('people'))->pluck('name'))->not->toContain('Sara Sithole');
});

it('will not give two workers the same number, but another farm may use it', function () {
    $s = pickingFarm();
    $other = pickingFarm();

    registerWorker($s, '14', 'Sara Sithole')->assertOk();
    registerWorker($s, '14', 'Piet Plaas')->assertStatus(409)->assertJsonPath('error.code', 'worker_number_taken');
    registerWorker($other, '14', 'Someone Else')->assertOk();
});

it('edits a worker\'s name, number and standing, keeps their own number, refuses another\'s', function () {
    $s = pickingFarm();
    $h = bearer(staffToken($s));
    registerWorker($s, '14', 'Sara Sithole');
    $piet = registerWorker($s, '15', 'Piet Plas')->json('person');

    $this->patchJson("/piecework/workers/{$piet['id']}", ['workerNumber' => '14'], $h)->assertStatus(409);
    $this->patchJson("/piecework/workers/{$piet['id']}", ['workerNumber' => '15', 'name' => 'Piet Plaas'], $h)->assertOk();
    $this->patchJson("/piecework/workers/{$piet['id']}", ['name' => 'Piet Plaas', 'workerNumber' => '015', 'active' => false], $h)->assertOk();

    $row = $s['db']->table('people')->where('id', $piet['id'])->first();
    expect($row->name)->toBe('Piet Plaas')->and($row->worker_number)->toBe('015')->and($row->active)->toBe(0);

    // A staff person is not a seasonal worker to edit here.
    $this->patchJson("/piecework/workers/{$s['person']['id']}", ['name' => 'X'], $h)->assertNotFound();
});

it('imports a payroll file: adds new workers, updates known ones, reports the rest by row', function () {
    $s = pickingFarm();
    registerWorker($s, '14', 'Sara Sithol');

    $csv = implode("\r\n", [
        'Worker Number,Name,Active',
        '14,Sara Sithole,yes', // the number the office already has, name corrected
        '15,Piet Plaas,yes',
        '16,Jan Jantjies,no',
        ',Nobody,yes', // no number
        '17,,yes', // no name
        '15,Piet Again,yes', // the same number twice in one file
        '014,Leading Zero,yes', // "014" is not "14": a payroll number keeps its zeros
    ]);

    $this->call('POST', '/piecework/workers/import', [], [], [], ['HTTP_AUTHORIZATION' => 'Bearer '.staffToken($s), 'CONTENT_TYPE' => 'text/csv'], $csv)
        ->assertOk()
        ->assertJsonPath('created', 3)
        ->assertJsonPath('updated', 1)
        ->assertJsonPath('skipped', [
            ['row' => 5, 'reason' => 'no_number'],
            ['row' => 6, 'reason' => 'no_name'],
            ['row' => 7, 'reason' => 'duplicate_number', 'workerNumber' => '15'],
        ]);

    $workers = $this->getJson('/piecework/workers', bearer(staffToken($s)))->json('workers');
    expect(array_map(fn ($w) => [$w['workerNumber'], $w['name'], $w['active']], $workers))->toBe([
        ['014', 'Leading Zero', true],
        ['14', 'Sara Sithole', true],
        ['15', 'Piet Plaas', true],
        ['16', 'Jan Jantjies', false],
    ]);
});

it('sends the register out as CSV the payment system can read back', function () {
    $s = pickingFarm();
    registerWorker($s, '14', 'Sara Sithole');

    $lines = array_values(array_filter(explode("\r\n", $this->get('/export/workers.csv', bearer(staffToken($s)))->assertOk()->getContent())));
    expect($lines)->toBe(["\u{FEFF}worker_number,name,active", '14,Sara Sithole,yes']);
});

it('attributes a scanned crate to its picker, not the device\'s person', function () {
    $s = pickingFarm();
    $picker = registerWorker($s, 'EMP-014', 'Sara Sithole')->json('person');

    // Typed off the card, lower case with a stray hyphen: normalised both sides.
    upload(ticketFor($s['farm'], $s['device'], ['boord'], seasonId: $s['season']['id']), [crateOp($s, 18.5, ' emp-014 ')])->assertOk();

    $row = $s['db']->table('harvest_events')->first();
    expect($row->picker_id)->toBe($picker['id'])
        ->and($row->picker_card_code)->toBe('EMP014')
        // The supervisor's device still stamps who captured it.
        ->and($row->created_by)->toBe($s['person']['id']);
});

it('keeps a crate with an unknown number, unattributed, for the office to place', function () {
    $s = pickingFarm();

    upload(ticketFor($s['farm'], $s['device'], ['boord']), [crateOp($s, 12, 'ZZZZ9999')])->assertOk();

    $row = $s['db']->table('harvest_events')->first();
    expect($row->picker_id)->toBeNull()->and($row->picker_card_code)->toBe('ZZZZ9999');

    $this->getJson('/piecework/unattributed', bearer(staffToken($s)))->assertOk()
        ->assertJsonCount(1, 'crates')
        ->assertJsonPath('crates.0.scannedNumber', 'ZZZZ9999')
        ->assertJsonPath('crates.0.weightKg', 12);
});

it('stops crediting a worker who has left', function () {
    $s = pickingFarm();
    $picker = registerWorker($s, '14', 'Sara Sithole')->json('person');
    $this->patchJson("/piecework/workers/{$picker['id']}", ['active' => false], bearer(staffToken($s)))->assertOk();

    upload(ticketFor($s['farm'], $s['device'], ['boord']), [crateOp($s, 9, '14')])->assertOk();

    $row = $s['db']->table('harvest_events')->first();
    expect($row->picker_id)->toBeNull()
        ->and($row->picker_card_code)->toBe('14')
        ->and($s['db']->table('people')->where('id', $picker['id'])->exists())->toBeTrue();
});

it('prices each picker\'s day against the tier in force', function () {
    $s = pickingFarm();
    $h = bearer(staffToken($s));
    $picker = registerWorker($s, '14', 'Sara Sithole')->json('person');

    $this->postJson('/piece-rates', ['effectiveFrom' => '2026-09-01', 'baseCentsPerKg' => 250, 'targetKg' => 100, 'bonusCentsPerKg' => 400], $h)
        ->assertOk()
        ->assertJsonPath('rate.targetKg', 100);

    $crate = fn (float $kg, string $at, array $extra = []) => capture($s, 'harvest_events', 'boord', ['season_id' => $s['season']['id'], 'block_id' => $s['block']['id'], 'weight_kg' => $kg, 'created_at' => $at, ...$extra]);
    // 120 kg in one day: 100 at base, 20 at bonus.
    $crate(70, '2026-09-10 06:00:00', ['picker_id' => $picker['id']]);
    $crate(52, '2026-09-10 11:00:00', ['picker_id' => $picker['id'], 'deduction_kg' => 2]);
    // Nobody's yet: counted separately, never priced.
    $crate(8, '2026-09-10 11:30:00', ['picker_card_code' => 'ZZZZ9999']);

    $this->getJson('/piecework/payout', $h)->assertOk()
        ->assertJsonPath('from', '2026-09-01')
        ->assertJsonPath('to', '2026-12-31')
        ->assertJsonPath('people', [['personId' => $picker['id'], 'personName' => 'Sara Sithole', 'kg' => 120, 'days' => 1, 'cents' => 100 * 250 + 20 * 400, 'unratedKg' => 0]])
        ->assertJsonPath('unattributedCrates', 1)
        ->assertJsonPath('unattributedKg', 8);

    $this->getJson('/piece-rates', $h)->assertOk()->assertJsonPath('season.name', 'Lietsjie 2026')->assertJsonCount(1, 'rates');
});

it('narrows the payout to a pay week', function () {
    $s = pickingFarm();
    $h = bearer(staffToken($s));
    $picker = registerWorker($s, '14', 'Sara Sithole')->json('person');
    $this->postJson('/piece-rates', ['effectiveFrom' => '2026-09-01', 'baseCentsPerKg' => 200], $h)->assertOk();

    foreach ([['2026-09-07 06:00:00', 10], ['2026-09-14 06:00:00', 30]] as [$at, $kg]) {
        capture($s, 'harvest_events', 'boord', ['season_id' => $s['season']['id'], 'block_id' => $s['block']['id'], 'picker_id' => $picker['id'], 'weight_kg' => $kg, 'created_at' => $at]);
    }

    $week = $this->getJson('/piecework/payout?from=2026-09-14&to=2026-09-20', $h)->assertOk();
    expect($week->json('from'))->toBe('2026-09-14')
        ->and(array_map(fn ($p) => [$p['kg'], $p['cents']], $week->json('people')))->toBe([[30, 30 * 200]]);
});

it('refuses half a tier, a zero rate, and a rate with no active season', function () {
    $s = pickingFarm();
    $h = bearer(staffToken($s));

    $this->postJson('/piece-rates', ['effectiveFrom' => '2026-09-01', 'baseCentsPerKg' => 250, 'targetKg' => 100], $h)->assertStatus(400);
    $this->postJson('/piece-rates', ['effectiveFrom' => '2026-09-01', 'baseCentsPerKg' => 0], $h)->assertStatus(400);
    $this->postJson('/piece-rates', ['effectiveFrom' => '2026-09-01', 'baseCentsPerKg' => 2.5], $h)->assertStatus(400);

    $s['db']->table('seasons')->update(['is_active' => false]);
    $this->postJson('/piece-rates', ['effectiveFrom' => '2026-09-01', 'baseCentsPerKg' => 250], $h)->assertNotFound();
});

it('gives the phone only this farm\'s active pickers', function () {
    $s = pickingFarm();
    $other = pickingFarm();

    registerWorker($s, '14', 'Sara Sithole');
    $gone = registerWorker($s, '15', 'Piet Plaas')->json('person');
    $this->patchJson("/piecework/workers/{$gone['id']}", ['active' => false], bearer(staffToken($s)));
    registerWorker($other, '14', 'Other Farm Picker');

    $this->getJson('/pickers', bearer(ticketFor($s['farm'], $s['device'], ['boord'])))->assertOk()
        ->assertJsonCount(1, 'pickers')
        ->assertJsonPath('pickers.0.workerNumber', '14')
        ->assertJsonPath('pickers.0.personName', 'Sara Sithole');
});
