<?php

use App\Farm\FarmDatabase;

function managementLogin(array $seeded): string
{
    return test()->postJson('/management/login', ['email' => $seeded['staff']['email'], 'password' => $seeded['password']])->assertOk()->json('token');
}

it('rejects a wrong management password', function () {
    $m = seedManagementStaff('wrongpass@example.com');

    $this->postJson('/management/login', ['email' => $m['staff']['email'], 'password' => 'not-it'])->assertUnauthorized()->assertJsonPath('error.code', 'invalid_credentials');
    $this->postJson('/management/login', ['email' => 'nobody@example.com', 'password' => 'not-it'])->assertUnauthorized();
});

it('does not let a farm office session into Plaashek Management', function () {
    $this->getJson('/management/farms', bearer(staffToken(seedFarm())))->assertUnauthorized();
});

it('does not let a management session into a farm office route', function () {
    $m = seedManagementStaff();

    $this->getJson('/farm', bearer(managementLogin($m)))->assertUnauthorized();
});

it('creates a farm with its own database and sets its licences', function () {
    $token = managementLogin(seedManagementStaff('manager@plaashek.test'));

    $farm = $this->postJson('/management/farms', ['organisationName' => 'Bekfontein Bpk', 'farmName' => 'Bekfontein', 'language' => 'af'], bearer($token))
        ->assertOk()
        ->assertJsonPath('farm.name', 'Bekfontein')
        ->assertJsonPath('organisation.name', 'Bekfontein Bpk')
        ->json('farm');

    $stored = central()->table('farms')->where('id', $farm['id'])->first();
    expect($stored->slug)->toBe('bekfontein')
        ->and($stored->db_database)->toBe('plaashek_test_f_bekfontein')
        ->and($stored->db_password)->not->toBe('hek') // encrypted, never plain
        ->and(farmDb($farm)->getSchemaBuilder()->hasTable('notes'))->toBeTrue();

    $this->putJson("/management/farms/{$farm['id']}/entitlements", ['moduleCode' => 'boord', 'status' => 'active'], bearer($token))
        ->assertOk()
        ->assertJsonPath('entitlement.moduleCode', 'boord');

    // Setting the same module again updates in place (unique farm + module).
    $this->putJson("/management/farms/{$farm['id']}/entitlements", ['moduleCode' => 'boord', 'status' => 'cancelled'], bearer($token))->assertOk();
    $rows = central()->table('entitlements')->where('farm_id', $farm['id'])->get();
    expect($rows)->toHaveCount(1)->and($rows[0]->status)->toBe('cancelled');

    $listed = $this->getJson('/management/farms', bearer($token))->assertOk()->json('farms');
    expect(collect($listed)->firstWhere('farm.id', $farm['id']))->toMatchArray([
        'farm' => ['id' => $farm['id'], 'name' => 'Bekfontein', 'language' => 'af'],
        'entitlements' => [['moduleCode' => 'boord', 'status' => 'cancelled']],
    ]);
});

it('gives each new farm its own slug and database, even with the same name', function () {
    $token = managementLogin(seedManagementStaff());

    $first = $this->postJson('/management/farms', ['organisationName' => 'A', 'farmName' => 'Mooi Plaas'], bearer($token))->json('farm');
    $second = $this->postJson('/management/farms', ['organisationName' => 'B', 'farmName' => 'Mooi Plaas'], bearer($token))->json('farm');

    expect(central()->table('farms')->whereIn('id', [$first['id'], $second['id']])->orderBy('slug')->pluck('db_database')->all())
        ->toBe(['plaashek_test_f_mooiplaas', 'plaashek_test_f_mooiplaas2']);
});

it('creates the farm\'s first office login, and the farm can then sign in with it', function () {
    $token = managementLogin(seedManagementStaff('manager2@plaashek.test'));
    $farm = $this->postJson('/management/farms', ['organisationName' => 'Bekfontein Bpk', 'farmName' => 'Bekfontein', 'language' => 'af'], bearer($token))->json('farm');

    $this->postJson("/management/farms/{$farm['id']}/logins", ['personName' => 'Bestuurder Botha', 'email' => 'admin@bekfontein.test', 'password' => 'bekfontein-wagwoord', 'role' => 'admin'], bearer($token))
        ->assertOk()
        ->assertJsonPath('membership.email', 'admin@bekfontein.test');

    // The login lives in the farm's own database; only the email is in central.
    expect(farmDb($farm)->table('farm_memberships')->where('email', 'admin@bekfontein.test')->exists())->toBeTrue()
        ->and(central()->table('login_directory')->where('email', 'admin@bekfontein.test')->value('farm_id'))->toBe($farm['id']);

    $this->postJson('/auth/login', ['email' => 'admin@bekfontein.test', 'password' => 'bekfontein-wagwoord'])
        ->assertOk()
        ->assertJsonPath('farmId', $farm['id'])
        ->assertJsonPath('role', 'admin')
        ->assertJsonPath('language', 'af');

    // Same email twice is refused, not a second login.
    $this->postJson("/management/farms/{$farm['id']}/logins", ['personName' => 'Iemand Anders', 'email' => 'admin@bekfontein.test', 'password' => 'ander-wagwoord', 'role' => 'owner'], bearer($token))
        ->assertStatus(409)
        ->assertJsonPath('error.code', 'email_taken');
});

it('refuses an email another farm already uses', function () {
    $token = managementLogin(seedManagementStaff());
    $taken = seedFarm(email: 'shared@example.com');
    $other = seedFarm();

    $this->postJson("/management/farms/{$other['farm']['id']}/logins", ['personName' => 'X', 'email' => 'shared@example.com', 'password' => 'long-enough', 'role' => 'admin'], bearer($token))
        ->assertStatus(409);
    expect($taken['farm']['id'])->not->toBe($other['farm']['id']);
});

it('needs the farm database handed over when it may not create one (cPanel)', function () {
    config(['plaashek.farm_databases.auto_create' => false]);
    $token = managementLogin(seedManagementStaff());

    $this->postJson('/management/farms', ['organisationName' => 'Org', 'farmName' => 'Bekfontein'], bearer($token))
        ->assertStatus(400)
        ->assertJsonPath('error.code', 'farm_database_required');
    expect(central()->table('farms')->count())->toBe(0);
});

it('uses the database it is given, and refuses one it cannot reach', function () {
    config(['plaashek.farm_databases.auto_create' => false]);
    $token = managementLogin(seedManagementStaff());
    central()->statement('CREATE DATABASE IF NOT EXISTS plaashek_test_f_gegee');

    $farm = $this->postJson('/management/farms', [
        'organisationName' => 'Org', 'farmName' => 'Gegee',
        'database' => ['name' => 'plaashek_test_f_gegee', 'username' => 'hek', 'password' => 'hek'],
    ], bearer($token))->assertOk()->json('farm');
    expect(farmDb($farm)->getDatabaseName())->toBe('plaashek_test_f_gegee');

    $this->postJson('/management/farms', [
        'organisationName' => 'Org', 'farmName' => 'Stukkend',
        'database' => ['name' => 'plaashek_test_f_gegee', 'username' => 'hek', 'password' => 'wrong'],
    ], bearer($token))->assertStatus(400)->assertJsonPath('error.code', 'farm_database_unreachable');
    expect(central()->table('farms')->count())->toBe(1);
});

it('logs management actions in central, not in the farm', function () {
    $m = seedManagementStaff();
    $token = managementLogin($m);
    $farm = $this->postJson('/management/farms', ['organisationName' => 'Org', 'farmName' => 'Oudit'], bearer($token))->json('farm');

    expect(central()->table('audit_log')->where('farm_id', $farm['id'])->pluck('action')->all())->toBe(['create_farm'])
        ->and(central()->table('audit_log')->value('actor_type'))->toBe('staff')
        ->and(app(FarmDatabase::class)->connect(central()->table('farms')->find($farm['id']))->table('audit_log')->count())->toBe(0);
});
