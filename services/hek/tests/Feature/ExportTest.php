<?php

use Illuminate\Testing\TestResponse;

/** The CSV body's lines, blank ones dropped (not trimmed first: that would eat the BOM Excel needs). */
function csvLines(TestResponse $response): array
{
    return array_values(array_filter(explode("\r\n", $response->getContent()), fn ($line) => $line !== ''));
}

it('scopes notes.csv to the farm and quotes a comma in the body', function () {
    $s = seedFarm();
    $other = seedFarm();
    $block = row($s['db'], 'blocks', ['farm_id' => $s['farm']['id'], 'name' => 'Blok A']);
    capture($s, 'notes', 'veldnotas', ['block_id' => $block['id'], 'body' => 'Rooi vrugte, min reën']);
    capture($other, 'notes', 'veldnotas', ['body' => "Other farm's note"]);

    $response = $this->get('/export/notes.csv', bearer(staffToken($s, 'owner')))->assertOk();

    expect($response->headers->get('content-type'))->toContain('text/csv')
        ->and($response->getContent())->toStartWith("\u{FEFF}id,created_at,person,block,season,body,latitude,longitude,weather_temp,weather_humidity,weather_condition\r\n")
        ->and($response->getContent())->toContain('"Rooi vrugte, min reën"')
        ->and($response->getContent())->not->toContain("Other farm's note");
});

it('exports every crate for the farm, not just the active season', function () {
    $s = seedFarm();
    $block = row($s['db'], 'blocks', ['farm_id' => $s['farm']['id'], 'name' => 'Blok A']);
    capture($s, 'harvest_events', 'boord', ['block_id' => $block['id'], 'weight_kg' => 12.5]);

    $response = $this->get('/export/harvest.csv', bearer(staffToken($s)))->assertOk()->assertHeader('content-disposition', 'attachment; filename="boord.csv"');
    $lines = csvLines($response);

    expect($lines[0])->toBe("\u{FEFF}id,created_at,person,block,season,weight_kg,deduction_kg,weather_temp,weather_humidity,weather_condition")
        ->and($lines[1])->toMatch('/,Blok A,,12\.5,,,,$/');
});

it('exports every punch for the farm, one row each', function () {
    $s = seedFarm();
    $other = seedFarm();
    capture($s, 'attendance_punches', 'span', ['direction' => 'in', 'created_at' => '2026-11-02 04:00:00', 'latitude' => -25.75, 'longitude' => 28.23]);
    capture($s, 'attendance_punches', 'span', ['direction' => 'out', 'created_at' => '2026-11-02 12:00:00']);
    capture($other, 'attendance_punches', 'span', ['direction' => 'in']);

    $lines = csvLines($this->get('/export/attendance.csv', bearer(staffToken($s)))->assertOk());

    expect($lines[0])->toBe("\u{FEFF}id,created_at,person,direction,season,latitude,longitude")
        ->and($lines)->toHaveCount(3)
        ->and($lines[1])->toMatch('/,2026-11-02T04:00:00\.000Z,Person,in,,-25\.75,28\.23$/')
        ->and($lines[2])->toMatch('/,Person,out,,,$/');
});

it('exports every stock move for the farm, one row each', function () {
    $s = seedFarm();
    $other = seedFarm();
    $block = row($s['db'], 'blocks', ['farm_id' => $s['farm']['id'], 'name' => 'Blok A']);
    $item = row($s['db'], 'stock_items', ['farm_id' => $s['farm']['id'], 'name' => 'Glifosaat', 'unit' => 'L']);
    $otherItem = row($other['db'], 'stock_items', ['farm_id' => $other['farm']['id'], 'name' => "Ander plaas s'n", 'unit' => 'L']);
    capture($s, 'stock_moves', 'stoor', ['item_id' => $item['id'], 'direction' => 'out', 'quantity' => 5, 'block_id' => $block['id'], 'note' => 'Blaarluis', 'created_at' => '2026-11-02 04:00:00']);
    capture($other, 'stock_moves', 'stoor', ['item_id' => $otherItem['id'], 'direction' => 'in', 'quantity' => 50]);

    $response = $this->get('/export/stock.csv', bearer(staffToken($s)))->assertOk()->assertHeader('content-disposition', 'attachment; filename="stoor.csv"');
    $lines = csvLines($response);

    expect($lines[0])->toBe("\u{FEFF}id,created_at,person,item,unit,direction,quantity,block,season,note")
        ->and($lines)->toHaveCount(2)
        ->and($lines[1])->toMatch('/,Person,Glifosaat,L,out,5,Blok A,,Blaarluis$/');
});

it('exports every water reading for the farm, one row each', function () {
    $s = seedFarm();
    $point = row($s['db'], 'water_points', ['farm_id' => $s['farm']['id'], 'name' => 'Boorgat 1', 'unit' => 'm³']);
    capture($s, 'meter_readings', 'water', ['water_point_id' => $point['id'], 'reading' => 1250, 'created_at' => '2026-06-01 04:00:00']);

    $lines = csvLines($this->get('/export/water.csv', bearer(staffToken($s)))->assertOk()->assertHeader('content-disposition', 'attachment; filename="water.csv"'));

    expect($lines[0])->toBe("\u{FEFF}id,created_at,person,point,unit,reading,note")
        ->and($lines[1])->toMatch('/,Person,Boorgat 1,m³,1250,$/');
});

it('exports raw work-order events and fuel fill-ups for the farm', function () {
    $s = seedFarm();
    $asset = row($s['db'], 'assets', ['farm_id' => $s['farm']['id'], 'name' => 'Trekker']);
    capture($s, 'work_orders', 'werkswinkel', ['asset_id' => $asset['id'], 'event' => 'opened', 'description' => 'Band pap', 'created_at' => '2026-06-01 04:00:00']);
    capture($s, 'fuel_logs', 'werkswinkel', ['asset_id' => $asset['id'], 'litres' => 45.5, 'meter_reading' => 12345, 'created_at' => '2026-06-02 04:00:00']);

    $orders = csvLines($this->get('/export/work-orders.csv', bearer(staffToken($s)))->assertOk());
    expect($orders[0])->toBe("\u{FEFF}id,created_at,person,asset,event,description")
        ->and($orders[1])->toMatch('/,Person,Trekker,opened,Band pap$/');

    $fuel = csvLines($this->get('/export/fuel.csv', bearer(staffToken($s)))->assertOk()->assertHeader('content-disposition', 'attachment; filename="brandstof.csv"'));
    expect($fuel[0])->toBe("\u{FEFF}id,created_at,person,asset,litres,meter_reading,note")
        ->and($fuel[1])->toMatch('/,Person,Trekker,45\.5,12345,$/');
});

it('prices each picker\'s day in piecework.csv and keeps the unplaced crates in the file', function () {
    $s = seedFarm();
    $block = row($s['db'], 'blocks', ['farm_id' => $s['farm']['id'], 'name' => 'Blok A']);
    $season = season($s, 'Lietsjie 2026', '2026-09-01', '2026-12-31');
    $picker = row($s['db'], 'people', ['farm_id' => $s['farm']['id'], 'name' => 'Sara Sithole', 'kind' => 'seasonal']);
    row($s['db'], 'piece_rates', ['farm_id' => $s['farm']['id'], 'season_id' => $season['id'], 'effective_from' => '2026-09-01', 'base_cents_per_kg' => 250, 'target_kg' => 100, 'bonus_cents_per_kg' => 400]);

    $crate = fn (float $kg, string $at, array $extra = []) => capture($s, 'harvest_events', 'boord', ['season_id' => $season['id'], 'block_id' => $block['id'], 'weight_kg' => $kg, 'created_at' => $at, ...$extra]);
    $crate(70, '2026-09-10 06:00:00', ['picker_id' => $picker['id']]);
    $crate(50, '2026-09-10 11:00:00', ['picker_id' => $picker['id']]);
    $crate(8, '2026-09-10 12:00:00', ['picker_card_code' => 'ZZZZ9999']);

    $lines = csvLines($this->get('/export/piecework.csv', bearer(staffToken($s)))->assertOk()->assertHeader('content-disposition', 'attachment; filename="stukwerk.csv"'));

    expect($lines[0])->toBe("\u{FEFF}day,picker,card_code,season,net_kg,base_cents_per_kg,target_kg,bonus_cents_per_kg,cents,rand")
        // 120 kg in one day: 100 at 250c and 20 at 400c = R330.00, on one row.
        ->and($lines[1])->toBe('2026-09-10,Sara Sithole,,Lietsjie 2026,120,250,100,400,33000,330.00')
        // The unplaced crate is still in the file, with its code and no pay line.
        ->and($lines[2])->toBe('2026-09-10,,ZZZZ9999,Lietsjie 2026,8,250,100,400,,');
});
