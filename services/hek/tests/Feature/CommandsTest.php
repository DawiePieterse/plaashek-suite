<?php

use App\Auth\Passwords;
use App\Console\Commands\Seed;

it('seeds Mooiplaas in its own database, and a second run resets only that farm', function () {
    $other = seedFarm();
    capture($other, 'notes', 'veldnotas', ['body' => 'Moenie my wis nie']);

    $this->artisan('plaashek:seed')->assertSuccessful();

    $farm = central()->table('farms')->where('name', 'Mooiplaas')->first();
    $db = farmDb((array) $farm);
    expect($farm->db_database)->toBe('plaashek_test_f_mooiplaas')
        ->and($db->table('people')->count())->toBe(6)
        ->and($db->table('seasons')->where('is_active', true)->count())->toBe(1)
        ->and(central()->table('entitlements')->where('farm_id', $farm->id)->pluck('module_code')->sort()->values()->all())
        ->toBe(['boord', 'span', 'stoor', 'veldnotas', 'water', 'werkswinkel']);

    $this->postJson('/auth/login', ['email' => 'admin@mooiplaas.test', 'password' => 'mooi1234'])->assertOk()->assertJsonPath('farmId', $farm->id);

    // Something captured on the demo farm, then a reset.
    $db->table('notes')->insert(['id' => uuid(), 'farm_id' => $farm->id, 'module_code' => 'veldnotas', 'created_by' => uuid(), 'device_id' => uuid(), 'body' => 'demo']);
    $this->artisan('plaashek:seed', ['--lang' => 'en'])->assertSuccessful();

    expect($db->table('notes')->count())->toBe(0)
        ->and($db->table('people')->count())->toBe(6)
        ->and(central()->table('farms')->where('name', 'Mooiplaas')->count())->toBe(1)
        ->and(central()->table('farms')->where('id', $farm->id)->value('language'))->toBe('en')
        ->and($other['db']->table('notes')->value('body'))->toBe('Moenie my wis nie');

    $this->postJson('/auth/login', ['email' => 'eienaar@mooiplaas.test', 'password' => 'mooi1234'])->assertOk()->assertJsonPath('language', 'en');
    expect(Seed::ORG_NAME)->toBe('Demo Organisasie');
});

it('creates a farm from the command line, with or without a database handed over', function () {
    $this->artisan('plaashek:farm-create', ['--organisation' => 'Laughing Waters', '--farm' => 'Bekfontein', '--lang' => 'af'])->assertSuccessful();
    expect(central()->table('farms')->where('slug', 'bekfontein')->value('db_database'))->toBe('plaashek_test_f_bekfontein');

    config(['plaashek.farm_databases.auto_create' => false]);
    $this->artisan('plaashek:farm-create', ['--organisation' => 'X', '--farm' => 'Sonder'])->assertFailed();

    central()->statement('CREATE DATABASE IF NOT EXISTS plaashek_test_f_cpanel');
    $this->artisan('plaashek:farm-create', ['--organisation' => 'X', '--farm' => 'Cpanel', '--db-name' => 'plaashek_test_f_cpanel', '--db-user' => 'hek', '--db-password' => 'hek'])->assertSuccessful();
});

it('migrates every farm database', function () {
    seedFarm();
    seedFarm();

    $this->artisan('plaashek:farms-migrate')->expectsOutputToContain('plaashek_test_f_farm2): up to date')->assertSuccessful();
});

it('creates a management login, then rotates its password', function () {
    $this->artisan('plaashek:staff-create', ['--email' => 'staff@plaashek.test', '--password' => 'eerste-wagwoord'])->assertSuccessful();
    $this->artisan('plaashek:staff-create', ['--email' => 'staff@plaashek.test', '--password' => 'tweede-wagwoord'])->expectsOutputToContain('Password updated')->assertSuccessful();

    $hash = central()->table('plaashek_staff')->where('email', 'staff@plaashek.test')->value('password_hash');
    expect(central()->table('plaashek_staff')->count())->toBe(1)
        ->and(Passwords::check('tweede-wagwoord', $hash))->toBeTrue();

    $this->artisan('plaashek:staff-create', ['--email' => 'not-an-email', '--password' => 'x'])->assertFailed();
});

it('prints fresh keys that the API can load', function () {
    $this->artisan('plaashek:keys', ['--show' => true])
        ->expectsOutputToContain('TICKET_SIGNING_KEY_JWK=')
        ->expectsOutputToContain('STAFF_SESSION_SECRET=')
        ->assertSuccessful();
});

it('dumps central and every farm database to its own file', function () {
    $a = seedFarm();
    capture($a, 'notes', 'veldnotas', ['body' => 'in die rugsteun']);
    $dir = sys_get_temp_dir().'/plaashek-backup-'.uuid();

    $this->artisan('plaashek:backup', ['--dir' => $dir])->assertSuccessful();

    $files = array_map('basename', glob("{$dir}/*.sql.gz"));
    expect($files)->toHaveCount(2)
        ->and(implode(' ', $files))->toContain('central-')->toContain('farm-farm-')
        ->and(gzdecode(file_get_contents(glob("{$dir}/farm-farm-*.sql.gz")[0])))->toContain('in die rugsteun');

    array_map('unlink', glob("{$dir}/*"));
    rmdir($dir);
})->skip(fn () => trim((string) shell_exec('command -v mysqldump')) === '', 'mysqldump not installed');
