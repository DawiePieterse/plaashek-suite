<?php

namespace App\Logic;

/**
 * What a picker earned, from the crates they filled and the rate in force on the day (ADR 0010,
 * docs/piecework-build-scope.md). Money is integer cents throughout. Nothing is stored: a crate that
 * syncs late changes the answer, which is correct.
 *
 * A rate is `['effectiveFrom' => 'YYYY-MM-DD', 'baseCentsPerKg' => int, 'targetKg' => ?float,
 * 'bonusCentsPerKg' => ?int]`. A crate is `['pickerId', 'pickerName', 'at', 'netKg']`.
 */
final class Piecework
{
    /** What a picker is paid on: the weight, less whatever was deducted. Stated once. */
    public static function netKg(float|int $weightKg, float|int|null $deductionKg): float|int
    {
        return $weightKg - ($deductionKg ?? 0);
    }

    /**
     * The rate in force on a day: the latest one that had started by then.
     *
     * @param  iterable<array<string, mixed>>  $rates
     * @return array<string, mixed>|null
     */
    public static function rateOn(string $day, iterable $rates): ?array
    {
        $winner = null;
        foreach ($rates as $rate) {
            if ($rate['effectiveFrom'] <= $day && (! $winner || $rate['effectiveFrom'] > $winner['effectiveFrom'])) {
                $winner = $rate;
            }
        }

        return $winner;
    }

    /**
     * A day's pay under one rate. The tier is daily, so this is the only level it can be applied at, and
     * the rounding happens once, at the day.
     *
     * @param  array<string, mixed>  $rate
     */
    public static function dayCents(float|int $kg, array $rate): int
    {
        if ($rate['targetKg'] === null || $rate['bonusCentsPerKg'] === null) {
            return Numbers::jsRound($kg * $rate['baseCentsPerKg']);
        }

        $atBase = min($kg, $rate['targetKg']);
        $aboveTarget = max(0, $kg - $rate['targetKg']);

        return Numbers::jsRound($atBase * $rate['baseCentsPerKg'] + $aboveTarget * $rate['bonusCentsPerKg']);
    }

    /**
     * Crates gathered into pay units: one picker, one farm day. The payout and the payroll CSV both start
     * here, so what a picker is paid on is decided once.
     *
     * @param  iterable<array<string, mixed>>  $crates
     * @return list<array{personId: string, personName: string, day: string, kg: float|int}>
     */
    public static function byPersonDay(iterable $crates): array
    {
        $buckets = [];
        foreach ($crates as $crate) {
            $day = FarmDay::key($crate['at']);
            $key = "{$crate['pickerId']}|{$day}";
            $buckets[$key] ??= ['personId' => $crate['pickerId'], 'personName' => $crate['pickerName'], 'day' => $day, 'kg' => 0];
            $buckets[$key]['kg'] += $crate['netKg'];
        }

        return array_values($buckets);
    }

    /**
     * Totals per picker over the crates given, priced day by day.
     *
     * @param  iterable<array<string, mixed>>  $crates
     * @param  list<array<string, mixed>>  $rates
     * @return list<array{personId: string, personName: string, kg: float|int, days: int, cents: int, unratedKg: float|int}>
     */
    public static function rollUp(iterable $crates, array $rates): array
    {
        $byPerson = [];
        foreach (self::byPersonDay($crates) as $unit) {
            $byPerson[$unit['personId']] ??= ['name' => $unit['personName'], 'days' => []];
            $byPerson[$unit['personId']]['days'][$unit['day']] = $unit['kg'];
        }

        $people = [];
        foreach ($byPerson as $personId => $person) {
            $kg = 0;
            $cents = 0;
            $unratedKg = 0;

            foreach ($person['days'] as $day => $dayKg) {
                $kg += $dayKg;
                $rate = self::rateOn((string) $day, $rates);
                if (! $rate) {
                    // Never price a day at zero and call it paid: the kg exist and the rate does not.
                    $unratedKg += $dayKg;

                    continue;
                }
                $cents += self::dayCents($dayKg, $rate);
            }

            $people[] = [
                'personId' => (string) $personId,
                'personName' => $person['name'],
                'kg' => Numbers::round2($kg),
                'days' => count($person['days']),
                'cents' => $cents,
                'unratedKg' => Numbers::round2($unratedKg),
            ];
        }

        usort($people, fn ($a, $b) => Numbers::compareNames($a['personName'], $b['personName']));

        return $people;
    }
}
