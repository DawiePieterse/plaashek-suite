<?php

namespace App\Auth;

use Carbon\Carbon;
use Carbon\CarbonImmutable;
use Firebase\JWT\ExpiredException;
use Firebase\JWT\JWT;
use Firebase\JWT\Key;

/**
 * Device tickets (plan §9): the farm's ceiling clipped to the device's floor, signed with Ed25519 so a
 * phone's claims can be checked offline. ADR 0003: 21 days.
 */
final class Tickets
{
    public const LIFE_DAYS = 21;

    /**
     * Signs a ticket. `modules` is the device's floor clipped to the farm's ceiling: a module the device
     * paired for but the farm has since dropped never makes it into the claims.
     *
     * @param  list<string>  $farmModules  modules the farm is licensed for now
     * @param  list<string>  $deviceModules  modules this device has scanned a QR for
     */
    public static function mint(
        SigningKeys $keys,
        string $farmId,
        string $deviceId,
        array $farmModules,
        array $deviceModules,
        string $language,
        ?string $seasonId,
        ?CarbonImmutable $now = null,
    ): string {
        $issuedAt = ($now ?? CarbonImmutable::now())->getTimestamp();
        $modules = array_values(array_filter($deviceModules, fn (string $m) => in_array($m, $farmModules, true)));

        return JWT::encode([
            'farm_id' => $farmId,
            'modules' => $modules,
            'lang' => $language,
            'season' => $seasonId,
            'sub' => $deviceId,
            'iat' => $issuedAt,
            'exp' => $issuedAt + self::LIFE_DAYS * 24 * 3600,
        ], base64_encode($keys->secretKey), 'EdDSA');
    }

    /**
     * Checks signature and expiry.
     *
     * @throws TicketExpired
     * @throws TicketInvalid
     */
    public static function verify(string $token, SigningKeys $keys, ?CarbonImmutable $now = null): TicketClaims
    {
        JWT::$timestamp = ($now ?? Carbon::now())->getTimestamp();

        try {
            $payload = JWT::decode($token, new Key(base64_encode($keys->publicKey), 'EdDSA'));
        } catch (ExpiredException) {
            throw new TicketExpired;
        } catch (\Throwable) {
            throw new TicketInvalid;
        } finally {
            JWT::$timestamp = null;
        }

        if (! isset($payload->farm_id, $payload->sub) || ! is_array($payload->modules ?? null)) {
            throw new TicketInvalid;
        }

        return new TicketClaims(
            farmId: (string) $payload->farm_id,
            deviceId: (string) $payload->sub,
            modules: array_values(array_map('strval', $payload->modules)),
            language: (string) ($payload->lang ?? 'af'),
            seasonId: isset($payload->season) ? (string) $payload->season : null,
            issuedAt: CarbonImmutable::createFromTimestampUTC((int) $payload->iat),
            expiresAt: CarbonImmutable::createFromTimestampUTC((int) $payload->exp),
        );
    }
}
