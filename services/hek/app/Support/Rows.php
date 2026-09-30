<?php

namespace App\Support;

use App\Logic\Numbers;
use Carbon\CarbonImmutable;
use DateTimeInterface;
use Illuminate\Support\Str;

/**
 * Database rows in the shape the apps already read: camelCase keys, booleans as booleans, times as ISO
 * strings in UTC with milliseconds (what a JavaScript `Date` serialises to), JSON columns decoded. Date
 * columns (`starts_on`, `effective_from`) stay `YYYY-MM-DD` strings.
 */
final class Rows
{
    private const BOOLEANS = ['active', 'is_active'];

    private const TIMES = ['at', 'valid_from', 'valid_until', 'client_time'];

    private const JSON = ['payload'];

    /** Columns that exist for the database's own sake and never leave it. */
    private const HIDDEN = ['active_marker', 'db_database', 'db_username', 'db_password', 'password_hash'];

    /**
     * @return array<string, mixed>
     */
    public static function one(object $row): array
    {
        $out = [];

        foreach ((array) $row as $column => $value) {
            if (in_array($column, self::HIDDEN, true)) {
                continue;
            }

            $out[Str::camel($column)] = match (true) {
                $value === null => null,
                in_array($column, self::BOOLEANS, true) => (bool) $value,
                in_array($column, self::TIMES, true) || str_ends_with($column, '_at') => self::iso($value),
                in_array($column, self::JSON, true) => json_decode((string) $value, true),
                is_float($value) => Numbers::tidy($value),
                default => $value,
            };
        }

        return $out;
    }

    /**
     * @param  iterable<object>  $rows
     * @return list<array<string, mixed>>
     */
    public static function all(iterable $rows): array
    {
        $out = [];
        foreach ($rows as $row) {
            $out[] = self::one($row);
        }

        return $out;
    }

    /** A stored UTC time as a JavaScript `Date` serialises it: `2026-09-30T08:15:00.000Z`. */
    public static function iso(DateTimeInterface|string $time): string
    {
        return self::time($time)->format('Y-m-d\TH:i:s.v\Z');
    }

    /** A time as the database stores it: UTC, to the microsecond. */
    public static function db(DateTimeInterface|string $time): string
    {
        return self::time($time)->format('Y-m-d H:i:s.u');
    }

    public static function time(DateTimeInterface|string $time): CarbonImmutable
    {
        return is_string($time)
            ? CarbonImmutable::parse($time, 'UTC')->utc()
            : CarbonImmutable::instance($time)->utc();
    }
}
