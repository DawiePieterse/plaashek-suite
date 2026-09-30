<?php

use App\Auth\Passwords;
use Illuminate\Support\Facades\Route;

it('signs a farm office login in, and refuses a wrong password or an unknown email', function () {
    $s = seedFarm(email: 'kantoor@plaas.test');
    $s['db']->table('farm_memberships')->where('id', $s['membership']['id'])->update(['password_hash' => Passwords::hash('regte-wagwoord')]);

    $this->postJson('/auth/login', ['email' => 'kantoor@plaas.test', 'password' => 'regte-wagwoord'])
        ->assertOk()
        ->assertJsonPath('farmId', $s['farm']['id'])
        ->assertJsonPath('farmMembershipId', $s['membership']['id'])
        ->assertJsonPath('role', 'admin');

    $this->postJson('/auth/login', ['email' => 'kantoor@plaas.test', 'password' => 'verkeerd'])->assertUnauthorized()->assertJsonPath('error.code', 'invalid_credentials');
    $this->postJson('/auth/login', ['email' => 'niemand@plaas.test', 'password' => 'verkeerd'])->assertUnauthorized()->assertJsonPath('error.code', 'invalid_credentials');
    $this->postJson('/auth/login', ['email' => 'not-an-email', 'password' => 'x'])->assertStatus(400)->assertJsonPath('error.code', 'validation_error');
});

it('refuses a login whose farm database no longer has it', function () {
    $s = seedFarm(email: 'weg@plaas.test');
    $s['db']->table('farm_memberships')->delete();

    $this->postJson('/auth/login', ['email' => 'weg@plaas.test', 'password' => 'enigiets'])->assertUnauthorized();
});

it('does not let a farm A staff token reach farm B\'s device', function () {
    $a = seedFarm();
    $b = seedFarm();
    $deviceB = row($b['db'], 'devices', ['farm_id' => $b['farm']['id'], 'label' => 'B device']);

    $this->postJson("/devices/{$deviceB['id']}/apps", ['moduleCode' => 'boord'], bearer(staffToken($a)))->assertNotFound();
});

it('rejects a role not in the allowed list', function () {
    Route::middleware(['api', 'staff:admin'])->get('/__test-admin-only', fn () => ['ok' => true]);
    $owner = seedFarm(role: 'owner');

    $this->getJson('/__test-admin-only', bearer(staffToken($owner)))->assertForbidden()->assertJsonPath('error.code', 'forbidden');
    $this->putJson('/farm/coordinates', ['lat' => -25, 'lon' => 31], bearer(staffToken($owner)))->assertForbidden();
});

it('rejects a missing or broken bearer token', function () {
    $this->getJson('/devices')->assertUnauthorized()->assertJsonPath('error.code', 'unauthenticated');
    $this->getJson('/devices', bearer('nonsense'))->assertUnauthorized();
});

it('refuses a session for a farm that does not exist', function () {
    $s = seedFarm();
    $token = staffToken($s);
    central()->statement('SET FOREIGN_KEY_CHECKS = 0');
    central()->table('farms')->delete();
    central()->statement('SET FOREIGN_KEY_CHECKS = 1');

    $this->getJson('/farm', bearer($token))->assertUnauthorized();
});

it('publishes the ticket key without its private half', function () {
    $keys = $this->getJson('/.well-known/jwks.json')->assertOk()->json('keys');

    expect($keys)->toHaveCount(1)
        ->and($keys[0])->toMatchArray(['kty' => 'OKP', 'crv' => 'Ed25519', 'alg' => 'EdDSA', 'use' => 'sig'])
        ->and($keys[0])->not->toHaveKey('d');
});

it('answers an unknown route with the usual error shape', function () {
    $this->getJson('/nowhere')->assertNotFound()->assertJsonPath('error.code', 'not_found');
});
