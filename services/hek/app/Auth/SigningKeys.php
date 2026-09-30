<?php

namespace App\Auth;

use InvalidArgumentException;

/**
 * The Ed25519 key pair that signs device tickets, read from `TICKET_SIGNING_KEY_JWK` (an OKP JWK with
 * the private `d`). The public half is published at `/.well-known/jwks.json`.
 */
final class SigningKeys
{
    public const KID = 'hek-1';

    /**
     * @param  string  $secretKey  sodium's 64-byte secret key
     * @param  string  $publicKey  32 bytes
     */
    public function __construct(
        public readonly string $secretKey,
        public readonly string $publicKey,
        public readonly string $kid = self::KID,
    ) {}

    public static function fromJwk(string $json): self
    {
        $jwk = json_decode($json, true);
        if (! is_array($jwk) || ($jwk['kty'] ?? null) !== 'OKP' || ($jwk['crv'] ?? null) !== 'Ed25519' || ! isset($jwk['d'])) {
            throw new InvalidArgumentException('TICKET_SIGNING_KEY_JWK must be an Ed25519 private JWK (run php artisan plaashek:keys)');
        }

        $pair = sodium_crypto_sign_seed_keypair(self::base64UrlDecode($jwk['d']));

        return new self(sodium_crypto_sign_secretkey($pair), sodium_crypto_sign_publickey($pair));
    }

    public static function generate(string $kid = self::KID): self
    {
        $pair = sodium_crypto_sign_keypair();

        return new self(sodium_crypto_sign_secretkey($pair), sodium_crypto_sign_publickey($pair), $kid);
    }

    /** The private JWK, as `.env` holds it. */
    public function privateJwk(): string
    {
        return (string) json_encode([
            'kty' => 'OKP',
            'crv' => 'Ed25519',
            'd' => self::base64UrlEncode(substr($this->secretKey, 0, 32)),
            'x' => self::base64UrlEncode($this->publicKey),
        ]);
    }

    /**
     * Public fields only, never `d`.
     *
     * @return array{keys: list<array<string, string>>}
     */
    public function jwks(): array
    {
        return ['keys' => [[
            'kty' => 'OKP',
            'crv' => 'Ed25519',
            'x' => self::base64UrlEncode($this->publicKey),
            'kid' => $this->kid,
            'use' => 'sig',
            'alg' => 'EdDSA',
        ]]];
    }

    public static function base64UrlEncode(string $bytes): string
    {
        return rtrim(strtr(base64_encode($bytes), '+/', '-_'), '=');
    }

    public static function base64UrlDecode(string $text): string
    {
        return (string) base64_decode(strtr($text, '-_', '+/'), true);
    }
}
