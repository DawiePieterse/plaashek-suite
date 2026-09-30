<?php

use App\Logic\Attendance;
use App\Logic\Csv;
use App\Logic\FarmDay;
use App\Logic\Piecework;
use App\Logic\WorkOrders;
use App\Weather\OpenMeteo;

// The pure logic the rollups, payouts and exports stand on, ported case for case from services/api.

function punch(string $direction, string $at, string $personId = 'anna', string $personName = 'Anna April'): array
{
    return ['personId' => $personId, 'personName' => $personName, 'direction' => $direction, 'at' => $at];
}

describe('attendance', function () {
    it('pairs each in with the out that follows it', function () {
        [$anna] = Attendance::rollUp([punch('in', '2026-06-01T04:00:00Z'), punch('out', '2026-06-01T12:30:00Z')]);

        expect($anna)->toMatchArray(['hours' => 8.5, 'days' => 1, 'openPunches' => 0]);
    });

    it('counts days by the day the shift started, in farm time', function () {
        // 20:00 SAST Monday to 02:00 SAST Tuesday: one shift, counted on the Monday.
        [$anna] = Attendance::rollUp([punch('in', '2026-06-01T18:00:00Z'), punch('out', '2026-06-02T00:00:00Z')]);

        expect($anna)->toMatchArray(['days' => 1, 'hours' => 6]);
    });

    it('reports a shift never closed as open, not guessed at', function () {
        [$anna] = Attendance::rollUp([punch('in', '2026-06-01T04:00:00Z'), punch('in', '2026-06-02T04:00:00Z'), punch('out', '2026-06-02T12:00:00Z')]);

        expect($anna)->toMatchArray(['hours' => 8, 'days' => 1, 'openPunches' => 1]);
    });

    it('counts an out with nothing open, and still clocked in, as open', function () {
        expect(Attendance::rollUp([punch('out', '2026-06-01T12:00:00Z')])[0])->toMatchArray(['hours' => 0, 'openPunches' => 1])
            ->and(Attendance::rollUp([punch('in', '2026-06-01T04:00:00Z')])[0])->toMatchArray(['hours' => 0, 'days' => 0, 'openPunches' => 1]);
    });

    it('pairs punches that arrive out of order', function () {
        [$anna] = Attendance::rollUp([punch('out', '2026-06-01T12:00:00Z'), punch('in', '2026-06-01T04:00:00Z')]);

        expect($anna)->toMatchArray(['hours' => 8, 'openPunches' => 0]);
    });

    it('groups per person, sorted by name', function () {
        $people = Attendance::rollUp([
            punch('in', '2026-06-01T04:00:00Z', 'piet', 'Piet Plaas'),
            punch('out', '2026-06-01T10:00:00Z', 'piet', 'Piet Plaas'),
            punch('in', '2026-06-01T04:00:00Z'),
            punch('out', '2026-06-01T08:00:00Z'),
        ]);

        expect(array_map(fn ($p) => [$p['personName'], $p['hours']], $people))->toBe([['Anna April', 4], ['Piet Plaas', 6]]);
    });
});

describe('csv', function () {
    it('reads back what it writes, BOM and all', function () {
        expect(Csv::parse(Csv::make(['worker_number', 'name'], [['014', 'Sara Sithole']])))->toBe([['worker_number' => '014', 'name' => 'Sara Sithole']]);
    });

    it('keeps commas and quotes in quoted cells', function () {
        expect(Csv::parse("worker_number,name\r\n7,\"Sithole, Sara \"\"Sara\"\"\"\r\n")[0]['name'])->toBe('Sithole, Sara "Sara"');
    });

    it('takes headers however the farm\'s own file spells them', function () {
        expect(Csv::parse("Worker Number,Full-Name\n9,Piet\n"))->toBe([['worker_number' => '9', 'full_name' => 'Piet']]);
    });

    it('does not count blank lines or a missing trailing newline as rows, nor a header alone', function () {
        expect(Csv::parse("a,b\n1,2\n\n3,4"))->toHaveCount(2)
            ->and(Csv::parse("worker_number,name\n"))->toBe([]);
    });

    it('writes numbers the way the Node exports did', function () {
        expect(Csv::make(['a', 'b', 'c', 'd'], [[5.0, 2.5, -25.75, null]]))->toBe("\u{FEFF}a,b,c,d\r\n5,2.5,-25.75,\r\n");
    });
});

describe('piecework', function () {
    $flat = ['effectiveFrom' => '2026-09-01', 'baseCentsPerKg' => 250, 'targetKg' => null, 'bonusCentsPerKg' => null];
    $tiered = ['effectiveFrom' => '2026-09-01', 'baseCentsPerKg' => 250, 'targetKg' => 100, 'bonusCentsPerKg' => 400];
    $crate = fn (string $pickerId, string $at, float|int $netKg, string $name = 'Anna April') => ['pickerId' => $pickerId, 'pickerName' => $name, 'at' => $at, 'netKg' => $netKg];

    it('pays every kilogram the same at a flat rate, base then bonus on a tier', function () use ($flat, $tiered) {
        expect(Piecework::dayCents(80, $flat))->toBe(20_000)
            ->and(Piecework::dayCents(120, $tiered))->toBe(100 * 250 + 20 * 400)
            ->and(Piecework::dayCents(99.5, $tiered))->toBe(24875);
    });

    it('applies the target per day, not per week', function () use ($tiered, $crate) {
        [$anna] = Piecework::rollUp(array_map(fn ($d) => $crate('anna', "2026-09-0{$d}T08:00:00Z", 80), [1, 2, 3, 4, 5]), [$tiered]);

        expect($anna)->toMatchArray(['kg' => 400, 'days' => 5, 'cents' => 5 * 80 * 250]);
    });

    it('adds up a day\'s crates before the tier, including across midnight UTC', function () use ($tiered, $crate) {
        [$sameDay] = Piecework::rollUp([$crate('anna', '2026-09-01T08:00:00Z', 60), $crate('anna', '2026-09-01T13:00:00Z', 60)], [$tiered]);
        // 20:00 and 23:30 SAST on the 1st: one farm day, so the tier sees 120 kg.
        [$lateShift] = Piecework::rollUp([$crate('anna', '2026-09-01T18:00:00Z', 60), $crate('anna', '2026-09-01T21:30:00Z', 60)], [$tiered]);

        expect($sameDay)->toMatchArray(['cents' => 100 * 250 + 20 * 400, 'days' => 1])
            ->and($lateShift)->toMatchArray(['cents' => 100 * 250 + 20 * 400, 'days' => 1]);
    });

    it('does not restate the days before a mid-season rate change', function () use ($flat, $crate) {
        $rates = [$flat, ['effectiveFrom' => '2026-09-15', 'baseCentsPerKg' => 300, 'targetKg' => null, 'bonusCentsPerKg' => null]];
        [$anna] = Piecework::rollUp([$crate('anna', '2026-09-10T08:00:00Z', 100), $crate('anna', '2026-09-20T08:00:00Z', 100)], $rates);

        expect($anna['cents'])->toBe(100 * 250 + 100 * 300)
            ->and(Piecework::rateOn('2026-09-14', $rates)['baseCentsPerKg'])->toBe(250)
            ->and(Piecework::rateOn('2026-09-15', $rates)['baseCentsPerKg'])->toBe(300)
            ->and(Piecework::rateOn('2026-08-31', $rates))->toBeNull();
    });

    it('reports kilograms picked before any rate, never priced at zero', function () use ($flat, $crate) {
        [$anna] = Piecework::rollUp([$crate('anna', '2026-08-20T08:00:00Z', 40)], [$flat]);

        expect($anna)->toMatchArray(['kg' => 40, 'unratedKg' => 40, 'cents' => 0]);
    });

    it('keeps pickers separate, sorted by name', function () use ($flat, $crate) {
        $people = Piecework::rollUp([$crate('piet', '2026-09-01T08:00:00Z', 50, 'Piet Plaas'), $crate('anna', '2026-09-01T08:00:00Z', 30)], [$flat]);

        expect(array_map(fn ($p) => [$p['personName'], $p['cents']], $people))->toBe([['Anna April', 30 * 250], ['Piet Plaas', 50 * 250]]);
    });
});

describe('farm day', function () {
    it('is SAST, and its edges bound whole farm days in UTC', function () {
        expect(FarmDay::key('2026-09-01T21:30:00Z'))->toBe('2026-09-01')
            ->and(FarmDay::key('2026-09-01T22:00:00Z'))->toBe('2026-09-02')
            ->and(FarmDay::start('2026-09-14')->toIso8601ZuluString())->toBe('2026-09-13T22:00:00Z')
            ->and(FarmDay::end('2026-09-20')->format('Y-m-d H:i:s.u'))->toBe('2026-09-20 21:59:59.999999');
    });
});

describe('weather', function () {
    it('maps known WMO codes to short words and anything else to unknown', function () {
        expect(OpenMeteo::condition(0))->toBe('clear')
            ->and(OpenMeteo::condition(61))->toBe('rain')
            ->and(OpenMeteo::condition(95))->toBe('thunderstorm')
            ->and(OpenMeteo::condition(-1))->toBe('unknown');
    });
});

describe('work orders', function () {
    $event = fn (string $kind, string $at, ?string $description = null, string $assetId = 'trekker', string $assetName = 'Trekker') => ['assetId' => $assetId, 'assetName' => $assetName, 'event' => $kind, 'description' => $description, 'at' => $at];

    it('keeps an opened job with no close open, and pairs a close off', function () use ($event) {
        expect(WorkOrders::open([$event('opened', '2026-06-01T04:00:00Z', 'Enjin wil nie vat nie')]))->toHaveCount(1)
            ->and(WorkOrders::open([$event('opened', '2026-06-01T04:00:00Z'), $event('closed', '2026-06-02T04:00:00Z')]))->toBe([])
            ->and(WorkOrders::open([$event('closed', '2026-06-01T04:00:00Z')]))->toBe([]);
    });

    it('keeps two faults open, and closes the oldest first', function () use ($event) {
        $two = [$event('opened', '2026-06-01T04:00:00Z', 'Band pap'), $event('opened', '2026-06-01T05:00:00Z', 'Rem lig werk nie')];

        expect(WorkOrders::open($two))->toHaveCount(2)
            ->and(WorkOrders::open([...$two, $event('closed', '2026-06-02T04:00:00Z')]))->sequence(fn ($job) => $job->description->toBe('Rem lig werk nie'));
    });

    it('pairs out-of-order arrivals and keeps assets separate', function () use ($event) {
        expect(WorkOrders::open([$event('closed', '2026-06-02T04:00:00Z'), $event('opened', '2026-06-01T04:00:00Z')]))->toBe([]);

        $open = WorkOrders::open([
            $event('opened', '2026-06-01T04:00:00Z', 'Band pap'),
            $event('opened', '2026-06-01T04:00:00Z', 'Pomp lek', 'pomp', 'Waterpomp'),
            $event('closed', '2026-06-02T04:00:00Z'),
        ]);
        expect($open)->toHaveCount(1)->and($open[0]['assetName'])->toBe('Waterpomp');
    });
});
