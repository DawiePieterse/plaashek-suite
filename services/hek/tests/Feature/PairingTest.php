<?php

use App\Auth\Tickets;
use Tests\TestCase;

/** A farm licensed for one module (or none), and a device added for it by the admin. */
function farmWithDevice(string $moduleCode = 'boord', ?string $status = 'active', ?string $addFor = null): array
{
    $seeded = seedFarm();
    if ($status) {
        entitle($seeded['farm'], $moduleCode, $status);
    }

    $add = test()->postJson('/devices', ['personId' => $seeded['person']['id'], 'moduleCode' => $addFor ?? $moduleCode], bearer(staffToken($seeded)));

    return [...$seeded, 'add' => $add];
}

it('rejects the second scan of a pairing token as already used', function () {
    $s = farmWithDevice();
    $token = $s['add']->assertOk()->json('pairingToken.token');

    $this->postJson("/pair/{$token}")->assertOk();
    $this->postJson("/pair/{$token}")->assertStatus(409)->assertJsonPath('error.code', 'token_used');
});

it('reprints: cancels the old token and issues a fresh one', function () {
    $s = farmWithDevice();
    $old = $s['add']->json('pairingToken');

    $reprint = $this->postJson("/pairing-tokens/{$old['id']}/reprint", [], bearer(staffToken($s)))->assertOk();
    $new = $reprint->json('pairingToken.token');
    expect($new)->not->toBe($old['token']);

    $this->postJson("/pair/{$old['token']}")->assertStatus(410)->assertJsonPath('error.code', 'token_cancelled');
    $this->postJson("/pair/{$new}")->assertOk();
});

it('fails the scan of a cancelled token', function () {
    $s = farmWithDevice();
    $token = $s['add']->json('pairingToken');

    $this->postJson("/pairing-tokens/{$token['id']}/cancel", [], bearer(staffToken($s)))->assertOk();
    $this->postJson("/pair/{$token['token']}")->assertStatus(410)->assertJsonPath('error.code', 'token_cancelled');
});

it('cannot scan an expired pairing token', function () {
    $s = farmWithDevice();
    $token = $s['add']->json('pairingToken');

    $s['db']->table('pairing_tokens')->where('id', $token['id'])->update(['expires_at' => now()->subSecond()->format('Y-m-d H:i:s.u')]);

    $this->postJson("/pair/{$token['token']}")->assertStatus(410)->assertJsonPath('error.code', 'token_expired');
});

it('cannot stamp a device with another farm\'s person', function () {
    $s = seedFarm();
    entitle($s['farm'], 'boord');
    $other = seedFarm();

    $this->postJson('/devices', ['personId' => $other['person']['id'], 'moduleCode' => 'boord'], bearer(staffToken($s)))->assertNotFound();
});

it('rejects adding a device for an unlicensed module', function () {
    farmWithDevice('boord', 'active', addFor: 'kudde')['add']->assertStatus(403)->assertJsonPath('error.code', 'not_licensed');
});

it('fails the scan when the licence was pulled after printing', function () {
    $s = farmWithDevice();
    $token = $s['add']->json('pairingToken.token');

    central()->table('entitlements')->where('farm_id', $s['farm']['id'])->update(['status' => 'suspended']);

    $this->postJson("/pair/{$token}")->assertStatus(403)->assertJsonPath('error.code', 'not_licensed');
});

it('pairs under a grace-status licence, same as active', function () {
    $s = farmWithDevice('veldnotas', 'grace');

    $this->postJson('/pair/'.$s['add']->json('pairingToken.token'))->assertOk()->assertJsonPath('modules', ['veldnotas']);
});

it('revokes: the next ticket refresh comes back with no modules', function () {
    $s = farmWithDevice();
    $deviceId = $s['add']->json('device.id');
    $ticket = $this->postJson('/pair/'.$s['add']->json('pairingToken.token'))->json('ticket');

    $this->postJson("/devices/{$deviceId}/revoke", [], bearer(staffToken($s)))->assertOk()->assertJsonPath('revokedModules', ['boord']);

    $refreshed = $this->postJson('/tickets/refresh', [], bearer($ticket))->assertOk()->json('ticket');
    expect(Tickets::verify($refreshed, TestCase::keys())->modules)->toBe([]);
});

it('puts the farm slug in front of the token and the field app address in the QR link', function () {
    $s = farmWithDevice();
    $token = $s['add']->json('pairingToken');

    expect($token['token'])->toStartWith($s['farm']['slug'].'-')
        ->and($token['qrUrl'])->toBe("http://localhost:5174/pair/{$token['token']}");
});

it('does not find a token by another farm\'s slug', function () {
    $s = farmWithDevice();
    $other = seedFarm();
    [, $secret] = explode('-', $s['add']->json('pairingToken.token'), 2);

    $this->postJson("/pair/{$other['farm']['slug']}-{$secret}")->assertNotFound();
    $this->postJson("/pair/{$secret}")->assertNotFound();
    $this->postJson('/pair/nobody-'.$secret)->assertNotFound();
});
