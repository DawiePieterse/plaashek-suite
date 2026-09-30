<?php

namespace App\Auth;

/** A Plaashek Management session: cross-farm, on its own secret so a farm login can never verify here. */
final class ManagementClaims
{
    public function __construct(
        public readonly string $staffId,
        public readonly string $email,
    ) {}

    public static function sign(self $claims): string
    {
        return SessionTokens::sign($claims->staffId, ['email' => $claims->email], (string) config('plaashek.management_session_secret'));
    }

    public static function verify(string $token): self
    {
        $payload = SessionTokens::verify($token, (string) config('plaashek.management_session_secret'));

        return new self((string) $payload->sub, (string) $payload->email);
    }
}
