<?php

namespace App\Logic;

use Collator;

final class Numbers
{
    private static ?Collator $collator = null;

    /** Rounded to two places, as `Math.round(x * 100) / 100` did; whole results come back as ints. */
    public static function round2(float|int $value): float|int
    {
        return self::tidy(self::jsRound($value * 100) / 100);
    }

    /** JavaScript's `Math.round`: halves go up, also for negatives. */
    public static function jsRound(float|int $value): int
    {
        return (int) floor($value + 0.5);
    }

    /** A whole float as an int, so JSON says `5`, not `5.0`, as it did from Node. */
    public static function tidy(float|int $value): float|int
    {
        return is_float($value) && floor($value) === $value && abs($value) < PHP_INT_MAX ? (int) $value : $value;
    }

    /** A number as JavaScript's `String()` writes it: `5`, `2.5`, `0.30000000000000004`. */
    public static function js(float|int $value): string
    {
        $value = self::tidy($value);

        return is_int($value) ? (string) $value : (string) json_encode($value);
    }

    /** Name order the way `localeCompare` sorted it: letters before case. */
    public static function compareNames(string $a, string $b): int
    {
        self::$collator ??= new Collator('en');

        return (int) self::$collator->compare($a, $b);
    }
}
