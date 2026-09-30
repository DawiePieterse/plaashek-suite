<?php

namespace App\Logic;

use App\Support\Rows;
use Carbon\CarbonImmutable;
use DateTimeInterface;

/**
 * Which calendar day a moment belongs to, from the farm's point of view. Plaashek sells in one country
 * (plan §10), so the farm's day is SAST. Give `farms` a timezone column the day that stops being true:
 * this is the only place that decides it, and both attendance and piece-work read it.
 */
final class FarmDay
{
    public const TIME_ZONE = 'Africa/Johannesburg';

    /** Farm-local `YYYY-MM-DD`. */
    public static function key(DateTimeInterface|string $at): string
    {
        return Rows::time($at)->setTimezone(self::TIME_ZONE)->format('Y-m-d');
    }

    /** The first instant of a farm-local day, in UTC. SAST is UTC+2 all year, no DST. */
    public static function start(string $day): CarbonImmutable
    {
        return CarbonImmutable::parse("{$day} 00:00:00", self::TIME_ZONE)->utc();
    }

    /** The last instant of a farm-local day, in UTC. */
    public static function end(string $day): CarbonImmutable
    {
        return CarbonImmutable::parse("{$day} 23:59:59.999999", self::TIME_ZONE)->utc();
    }
}
