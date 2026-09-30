<?php

use App\Auth\ManagementClaims;
use App\Auth\Passwords;
use App\Auth\StaffClaims;
use App\Auth\Tickets;
use App\Farm\FarmDatabase;
use App\Farm\FarmProvisioner;
use Illuminate\Database\Connection;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Str;
use Tests\TestCase;

uses(TestCase::class)->in('Feature', 'Unit');

/*
 * Fixtures, the same shapes the Node tests used. A farm is its central rows plus its own database;
 * `$farm['db']` is that database.
 */

function uuid(): string
{
    return (string) Str::uuid();
}

function central(): Connection
{
    return DB::connection('central');
}

/** A farm's own database, from its central row. */
function farmDb(array $farm): Connection
{
    return app(FarmDatabase::class)->connect(central()->table('farms')->where('id', $farm['id'])->first());
}

/**
 * Inserts a row with a fresh id and returns it.
 *
 * @param  array<string, mixed>  $values
 * @return array<string, mixed>
 */
function row(Connection $db, string $table, array $values): array
{
    $values = ['id' => uuid(), ...$values];
    $db->table($table)->insert($values);

    return $values;
}

/**
 * A farm with its own database, one person and one office login for them.
 *
 * @return array{org: array<string, mixed>, farm: array<string, mixed>, person: array<string, mixed>, membership: array<string, mixed>, db: Connection}
 */
function seedFarm(string $role = 'admin', ?string $email = null, string $language = 'af'): array
{
    $created = app(FarmProvisioner::class)->create('Org', 'Farm', $language, null, null);
    $farm = [...$created['farm'], 'slug' => central()->table('farms')->where('id', $created['farm']['id'])->value('slug')];
    $db = farmDb($farm);

    $person = row($db, 'people', ['farm_id' => $farm['id'], 'name' => 'Person']);
    $email ??= "staff-{$farm['id']}@example.com";
    $membership = row($db, 'farm_memberships', ['farm_id' => $farm['id'], 'person_id' => $person['id'], 'email' => $email, 'role' => $role]);
    central()->table('login_directory')->insert(['email' => $email, 'farm_id' => $farm['id']]);

    return ['org' => $created['organisation'], 'farm' => $farm, 'person' => $person, 'membership' => $membership, 'db' => $db];
}

/**
 * @return array{staff: array<string, mixed>, password: string}
 */
function seedManagementStaff(?string $email = null, string $password = 'test-password'): array
{
    $staff = row(central(), 'plaashek_staff', ['email' => $email ?? 'management-'.uuid().'@example.com', 'password_hash' => Passwords::hash($password)]);

    return ['staff' => $staff, 'password' => $password];
}

function entitle(array $farm, string $moduleCode, string $status = 'active'): void
{
    row(central(), 'entitlements', ['farm_id' => $farm['id'], 'module_code' => $moduleCode, 'status' => $status]);
}

/**
 * A farm with one phone paired for `$moduleCode`, assigned to one person. Assigned in the past so a
 * capture dated mid-test still finds its assignment (plan §3.2).
 *
 * @return array<string, mixed>
 */
function pairedPhone(string $moduleCode, string $status = 'active'): array
{
    $seeded = seedFarm();
    entitle($seeded['farm'], $moduleCode, $status);

    $device = row($seeded['db'], 'devices', ['farm_id' => $seeded['farm']['id'], 'label' => 'Toetsfoon']);
    row($seeded['db'], 'device_modules', ['device_id' => $device['id'], 'module_code' => $moduleCode]);
    row($seeded['db'], 'device_assignments', [
        'device_id' => $device['id'],
        'person_id' => $seeded['person']['id'],
        'assigned_by' => $seeded['membership']['id'],
        'assigned_at' => '2026-01-01 00:00:00',
    ]);

    return [...$seeded, 'device' => $device];
}

/** The ticket that phone would carry. `$farmModules` defaults to the same modules: pass [] for a lapsed licence. */
function ticketFor(array $farm, array $device, array $modules, ?array $farmModules = null, ?string $seasonId = null): string
{
    return Tickets::mint(TestCase::keys(), $farm['id'], $device['id'], $farmModules ?? $modules, $modules, 'af', $seasonId);
}

function staffToken(array $seeded, ?string $role = null): string
{
    return StaffClaims::sign(new StaffClaims($seeded['membership']['id'], $seeded['farm']['id'], $role ?? $seeded['membership']['role']));
}

function managementToken(array $staff): string
{
    return ManagementClaims::sign(new ManagementClaims($staff['id'], $staff['email']));
}

/** @return array<string, string> */
function bearer(string $token): array
{
    return ['authorization' => "Bearer {$token}"];
}
