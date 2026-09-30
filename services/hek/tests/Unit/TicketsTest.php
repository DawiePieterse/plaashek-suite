<?php

use App\Auth\Passwords;
use App\Auth\SigningKeys;
use App\Auth\TicketExpired;
use App\Auth\TicketInvalid;
use App\Auth\Tickets;
use App\Farm\Farms;
use App\Farm\PairingTokens;
use Carbon\CarbonImmutable;

it('clips the floor to the ceiling in the ticket claims', function () {
    $keys = SigningKeys::generate();
    $token = Tickets::mint($keys, 'farm-1', 'device-1', ['boord', 'veldnotas'], ['boord', 'kudde'], 'en', null);

    $claims = Tickets::verify($token, $keys);
    expect($claims->modules)->toBe(['boord'])
        ->and($claims->farmId)->toBe('farm-1')
        ->and($claims->deviceId)->toBe('device-1')
        ->and($claims->language)->toBe('en')
        ->and($claims->seasonId)->toBeNull();
});

it('rejects a signature from the wrong key', function () {
    $token = Tickets::mint(SigningKeys::generate(), 'farm-1', 'device-1', ['boord'], ['boord'], 'af', null);

    Tickets::verify($token, SigningKeys::generate());
})->throws(TicketInvalid::class);

it('expires a ticket after 21 days (ADR 0003)', function () {
    $keys = SigningKeys::generate();
    $mintedAt = CarbonImmutable::parse('2026-01-01T00:00:00Z');
    $token = Tickets::mint($keys, 'farm-1', 'device-1', ['boord'], ['boord'], 'af', null, $mintedAt);

    expect(Tickets::verify($token, $keys, $mintedAt->addDays(20))->modules)->toBe(['boord']);
    expect(fn () => Tickets::verify($token, $keys, $mintedAt->addDays(22)))->toThrow(TicketExpired::class);
});

it('reads back the key it writes to .env', function () {
    $keys = SigningKeys::generate();
    $again = SigningKeys::fromJwk($keys->privateJwk());

    expect($again->publicKey)->toBe($keys->publicKey)
        ->and(Tickets::verify(Tickets::mint($again, 'f', 'd', ['a'], ['a'], 'af', null), $keys)->modules)->toBe(['a']);
});

it('checks passwords, and never passes an empty stored one', function () {
    $stored = Passwords::hash('correct-horse-battery-staple');

    expect(Passwords::check('correct-horse-battery-staple', $stored))->toBeTrue()
        ->and(Passwords::check('wrong-password', $stored))->toBeFalse()
        ->and(Passwords::check('anything', null))->toBeFalse();
});

it('derives a pairing token state: used, then cancelled, then expired at the exact instant', function () {
    $row = fn (array $o = []) => (object) [...['used_at' => null, 'cancelled_at' => null, 'expires_at' => '2026-01-03 00:00:00'], ...$o];
    $now = CarbonImmutable::parse('2026-01-02T00:00:00Z');

    expect(PairingTokens::state($row(), $now))->toBe('pending')
        ->and(PairingTokens::state($row(['used_at' => '2026-01-01 12:00:00', 'cancelled_at' => '2026-01-01 13:00:00']), $now))->toBe('used')
        ->and(PairingTokens::state($row(['cancelled_at' => '2026-01-01 12:00:00']), $now))->toBe('cancelled')
        ->and(PairingTokens::state($row(), CarbonImmutable::parse('2026-01-03T00:00:00Z')))->toBe('expired')
        ->and(PairingTokens::state($row(), CarbonImmutable::parse('2026-01-03T00:00:01Z')))->toBe('expired');
});

it('counts active and grace toward the ceiling, not suspended', function () {
    $s = seedFarm();
    entitle($s['farm'], 'boord');
    entitle($s['farm'], 'veldnotas', 'grace');
    entitle($s['farm'], 'kudde', 'suspended');

    $ceiling = Farms::activeModuleCodes($s['farm']['id']);
    sort($ceiling);
    expect($ceiling)->toBe(['boord', 'veldnotas'])
        ->and(Farms::moduleStatus($s['farm']['id'], 'kudde'))->toBe('suspended')
        ->and(Farms::moduleStatus($s['farm']['id'], 'water'))->toBeNull();
});
