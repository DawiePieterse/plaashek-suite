<?php

namespace Tests;

use App\Auth\SigningKeys;
use Illuminate\Foundation\Testing\TestCase as BaseTestCase;
use Illuminate\Support\Facades\Artisan;
use Illuminate\Support\Facades\DB;

/**
 * Tests run against MariaDB: the central database `plaashek_test`, and one `plaashek_test_f_<slug>` per
 * farm the fixtures create (FARM_DB_AUTO_CREATE in phpunit.xml).
 *
 * Once per run the central schema is rebuilt and old farm databases dropped, so a schema change never
 * meets a stale test database. Before each test every table is emptied; farm databases are reused, so
 * each test's first farm lands in `..._f_farm` again, already migrated.
 */
abstract class TestCase extends BaseTestCase
{
    private static bool $prepared = false;

    private static ?SigningKeys $keys = null;

    protected function setUp(): void
    {
        parent::setUp();

        self::$keys ??= SigningKeys::generate('test');
        config([
            'plaashek.ticket_signing_key_jwk' => self::$keys->privateJwk(),
            'plaashek.staff_session_secret' => base64_encode(str_repeat('s', 32)),
            'plaashek.management_session_secret' => base64_encode(str_repeat('m', 32)),
        ]);
        $this->app->instance(SigningKeys::class, self::$keys);

        if (! self::$prepared) {
            foreach ($this->farmDatabases() as $database) {
                DB::connection('central')->statement("DROP DATABASE `{$database}`");
            }
            Artisan::call('migrate:fresh', ['--force' => true]);
            self::$prepared = true;
        }

        $this->emptyEveryTable();
    }

    public static function keys(): SigningKeys
    {
        return self::$keys ??= SigningKeys::generate('test');
    }

    private function emptyEveryTable(): void
    {
        $central = DB::connection('central');
        $central->statement('SET FOREIGN_KEY_CHECKS = 0');
        foreach (['audit_log', 'login_directory', 'entitlements', 'plaashek_staff', 'farms', 'organisations'] as $table) {
            $central->table($table)->delete();
        }
        $central->statement('SET FOREIGN_KEY_CHECKS = 1');

        foreach ($this->farmDatabases() as $database) {
            $tables = $central->select('SELECT table_name AS name FROM information_schema.tables WHERE table_schema = ? AND table_name <> ?', [$database, 'migrations']);
            $central->statement('SET FOREIGN_KEY_CHECKS = 0');
            foreach ($tables as $table) {
                $central->statement("DELETE FROM `{$database}`.`{$table->name}`");
            }
            $central->statement('SET FOREIGN_KEY_CHECKS = 1');
        }
    }

    /**
     * @return list<string>
     */
    private function farmDatabases(): array
    {
        $prefix = config('plaashek.farm_databases.prefix').'f_';

        return array_map(
            fn (object $row) => $row->name,
            DB::connection('central')->select('SELECT schema_name AS name FROM information_schema.schemata WHERE schema_name LIKE ?', [str_replace('_', '\_', $prefix).'%']),
        );
    }
}
