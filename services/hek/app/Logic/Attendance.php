<?php

namespace App\Logic;

use App\Support\Rows;

/**
 * Span's punches turned into what the owner asks for: days and hours per person
 * (docs/span-build-scope.md). Derived at read time, never stored: a late punch changes the answer.
 */
final class Attendance
{
    /**
     * Pairs each `in` with the `out` that follows it, in time order, per person. Anything that does not
     * pair is reported as open rather than guessed at: the phone never refuses a punch (plan §8), so the
     * office is the only place a missing `out` shows.
     *
     * @param  iterable<array{personId: string, personName: string, direction: string, at: string}>  $punches
     * @return list<array{personId: string, personName: string, days: int, hours: float|int, openPunches: int}>
     */
    public static function rollUp(iterable $punches): array
    {
        $byPerson = [];
        foreach ($punches as $punch) {
            $byPerson[$punch['personId']][] = $punch;
        }

        $people = [];

        foreach ($byPerson as $personId => $own) {
            usort($own, fn ($a, $b) => self::ms($a['at']) <=> self::ms($b['at']));
            $days = [];
            $milliseconds = 0;
            $open = 0;
            $openedAt = null;

            foreach ($own as $punch) {
                if ($punch['direction'] === 'in') {
                    // A second `in`: the previous shift was never closed. Count it open, start fresh.
                    if ($openedAt !== null) {
                        $open++;
                    }
                    $openedAt = $punch['at'];

                    continue;
                }

                if ($openedAt === null) {
                    $open++; // an `out` with nothing open

                    continue;
                }

                $milliseconds += self::ms($punch['at']) - self::ms($openedAt);
                $days[FarmDay::key($openedAt)] = true;
                $openedAt = null;
            }

            if ($openedAt !== null) {
                $open++; // still clocked in, or went home without clocking out
            }

            $people[] = [
                'personId' => (string) $personId,
                'personName' => $own[0]['personName'],
                'days' => count($days),
                'hours' => Numbers::round2($milliseconds / 3_600_000),
                'openPunches' => $open,
            ];
        }

        usort($people, fn ($a, $b) => Numbers::compareNames($a['personName'], $b['personName']));

        return $people;
    }

    private static function ms(string $at): int
    {
        return (int) Rows::time($at)->getPreciseTimestamp(3);
    }
}
