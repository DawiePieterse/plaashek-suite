<?php

namespace App\Auth;

use Carbon\CarbonImmutable;

/** What a device's ticket says it may do: the modules its home screen unlocks. */
final class TicketClaims
{
    /**
     * @param  list<string>  $modules  the farm's licensed modules intersected with the device's scanned ones
     */
    public function __construct(
        public readonly string $farmId,
        public readonly string $deviceId,
        public readonly array $modules,
        public readonly string $language,
        public readonly ?string $seasonId,
        public readonly CarbonImmutable $issuedAt,
        public readonly CarbonImmutable $expiresAt,
    ) {}
}
