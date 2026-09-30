<?php

namespace App\Auth;

/** A farm office session: Farm Admin Tool (`admin`) or Owner Module (`owner`). */
final class StaffClaims
{
    public function __construct(
        public readonly string $farmMembershipId,
        public readonly string $farmId,
        public readonly string $role,
    ) {}

    public static function sign(self $claims): string
    {
        return SessionTokens::sign($claims->farmMembershipId, ['farm_id' => $claims->farmId, 'role' => $claims->role], (string) config('plaashek.staff_session_secret'));
    }

    public static function verify(string $token): self
    {
        $payload = SessionTokens::verify($token, (string) config('plaashek.staff_session_secret'));

        return new self((string) $payload->sub, (string) $payload->farm_id, (string) $payload->role);
    }
}
