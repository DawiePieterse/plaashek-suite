<?php

namespace App\Auth;

use Carbon\Carbon;
use Firebase\JWT\JWT;
use Firebase\JWT\Key;

/**
 * HS256 office sessions, 12 hours. Farm office logins and Plaashek Management each sign with their own
 * secret, so a farm session can never verify as Management.
 */
final class SessionTokens
{
    public const LIFE_HOURS = 12;

    /**
     * @param  array<string, string>  $claims
     */
    public static function sign(string $subject, array $claims, string $secret): string
    {
        $now = Carbon::now()->getTimestamp();

        return JWT::encode(
            [...$claims, 'sub' => $subject, 'iat' => $now, 'exp' => $now + self::LIFE_HOURS * 3600],
            self::key($secret),
            'HS256',
        );
    }

    /** The payload, or an exception when the signature, algorithm or expiry is wrong. */
    public static function verify(string $token, string $secret): object
    {
        JWT::$timestamp = Carbon::now()->getTimestamp();

        try {
            return JWT::decode($token, new Key(self::key($secret), 'HS256'));
        } finally {
            JWT::$timestamp = null;
        }
    }

    private static function key(string $secret): string
    {
        return (string) base64_decode($secret, true);
    }
}
