<?php

namespace App\Farm;

use App\Http\ApiError;
use App\Support\Rows;
use Illuminate\Database\Connection;
use Illuminate\Database\Migrations\Migrator;
use Illuminate\Support\Facades\Crypt;
use Illuminate\Support\Str;
use Throwable;

/**
 * Makes a farm: its own database set up first, then its central rows (ADR 0015).
 *
 * The database comes one of two ways. On cPanel hosting (Afrihost) the operator makes it in the Database
 * Wizard and hands over its name, user and password. On a local machine or a VPS, with
 * `FARM_DB_AUTO_CREATE=true`, the API creates it with the central connection's user.
 *
 * Nothing is written to `central` until the farm database is reachable and migrated, so a failed setup
 * leaves no farm pointing at nothing. Migrating is safe to repeat, so a retry just carries on.
 */
final class FarmProvisioner
{
    public const FARM_MIGRATIONS = 'database/migrations/farm';

    public function __construct(
        private readonly FarmDatabase $farms,
        private readonly Migrator $migrator,
    ) {}

    /**
     * @param  array{name: string, username: string, password: string}|null  $database
     * @return array{organisation: array<string, mixed>, farm: array<string, mixed>}
     */
    public function create(string $organisationName, string $farmName, string $language, ?array $database, ?string $actorStaffId): array
    {
        $central = Farms::central();
        $slug = $this->freeSlug($central, $farmName);

        if ($database === null) {
            if (! config('plaashek.farm_databases.auto_create')) {
                throw ApiError::badRequest('farm_database_required', 'Make the farm database in cPanel first and give its name, user and password');
            }

            $database = [
                'name' => config('plaashek.farm_databases.prefix').'f_'.$slug,
                'username' => (string) $central->getConfig('username'),
                'password' => (string) $central->getConfig('password'),
            ];

            $central->statement("CREATE DATABASE IF NOT EXISTS `{$database['name']}` CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci");
        }

        $farm = (object) [
            'id' => (string) Str::uuid7(),
            'slug' => $slug,
            'db_database' => $database['name'],
            'db_username' => $database['username'],
            'db_password' => Crypt::encryptString($database['password']),
        ];

        try {
            $this->migrate($farm);
        } catch (Throwable $e) {
            report($e);
            throw ApiError::badRequest('farm_database_unreachable', 'The farm database could not be reached or set up');
        }

        return $central->transaction(function () use ($central, $farm, $organisationName, $farmName, $language, $actorStaffId) {
            $organisation = ['id' => (string) Str::uuid7(), 'name' => $organisationName];
            $central->table('organisations')->insert($organisation);

            $central->table('farms')->insert([
                'id' => $farm->id,
                'organisation_id' => $organisation['id'],
                'name' => $farmName,
                'slug' => $farm->slug,
                'language' => $language,
                'db_database' => $farm->db_database,
                'db_username' => $farm->db_username,
                'db_password' => $farm->db_password,
            ]);

            if ($actorStaffId !== null) {
                Farms::audit($central, $actorStaffId, 'create_farm', $farm->id, $farm->id, 'staff');
            }

            return [
                'organisation' => self::present($central->table('organisations')->where('id', $organisation['id'])->first()),
                'farm' => self::present($central->table('farms')->where('id', $farm->id)->first(['id', 'organisation_id', 'name', 'language', 'latitude', 'longitude', 'created_at'])),
            ];
        });
    }

    /** Runs any farm migrations the farm's database has not had yet. */
    public function migrate(object $farm): void
    {
        $connection = FarmDatabase::connectionName($farm->slug);
        $this->farms->connect($farm)->getPdo();

        $this->migrator->usingConnection($connection, function () {
            if (! $this->migrator->repositoryExists()) {
                $this->migrator->getRepository()->createRepository();
            }

            $this->migrator->run([base_path(self::FARM_MIGRATIONS)]);
        });
    }

    /**
     * Lowercase letters and digits from the farm name, up to 12, then a number if another farm has it.
     * It ends up in a database name and a cPanel user name, which is why it is short.
     */
    private function freeSlug(Connection $central, string $farmName): string
    {
        $base = substr((string) preg_replace('/[^a-z0-9]/', '', Str::lower(Str::ascii($farmName))), 0, 12) ?: 'plaas';
        $slug = $base;

        for ($n = 2; $central->table('farms')->where('slug', $slug)->exists(); $n++) {
            $slug = $base.$n;
        }

        return $slug;
    }

    /**
     * @return array<string, mixed>
     */
    private static function present(?object $row): array
    {
        return $row ? Rows::one($row) : [];
    }
}
