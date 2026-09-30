<?php

namespace App\Auth;

use Illuminate\Support\Facades\Hash;
use Illuminate\Support\Str;

final class Passwords
{
    private static ?string $dummy = null;

    public static function hash(string $password): string
    {
        return Hash::make($password);
    }

    /**
     * Checks against the dummy hash when there is no stored one, so an unknown email costs the same time
     * as a known one.
     */
    public static function check(string $password, ?string $stored): bool
    {
        $ok = Hash::check($password, $stored ?? self::dummy());

        return $stored !== null && $ok;
    }

    private static function dummy(): string
    {
        return self::$dummy ??= Hash::make(Str::random(32));
    }
}
