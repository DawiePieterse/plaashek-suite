<?php

namespace App\Farm;

use App\Auth\SigningKeys;
use Carbon\CarbonImmutable;

/**
 * The printed QR slip is a bearer credential (plan §3.4, §10), good for 48 hours.
 *
 * A token is `<farm slug>-<random>`: the scan that redeems it carries no session, and the slug is how
 * it finds the farm's database (ADR 0015). A slug is only letters and digits, so the first hyphen ends
 * it. Not a dot: a static server can take `/pair/farm.abc` for a file. The field app treats the whole
 * thing as opaque.
 */
final class PairingTokens
{
    public const LIFE_HOURS = 48;

    public static function random(string $slug): string
    {
        return $slug.'-'.SigningKeys::base64UrlEncode(random_bytes(24));
    }

    /** The slug a token starts with, or null if it has none. */
    public static function slugOf(string $token): ?string
    {
        $end = strpos($token, '-');

        return $end > 0 ? substr($token, 0, $end) : null;
    }

    public static function expiry(CarbonImmutable $now): CarbonImmutable
    {
        return $now->addHours(self::LIFE_HOURS);
    }

    public static function qrUrl(string $token): string
    {
        return config('plaashek.field_app_url').'/pair/'.$token;
    }

    /** State is derived, never stored (plan §3.4): pending, used, cancelled or expired. */
    public static function state(object $row, CarbonImmutable $now): string
    {
        return match (true) {
            $row->used_at !== null => 'used',
            $row->cancelled_at !== null => 'cancelled',
            CarbonImmutable::parse($row->expires_at, 'UTC') <= $now => 'expired',
            default => 'pending',
        };
    }
}
