<?php

namespace App\Console\Commands;

use App\Auth\Passwords;
use App\Farm\FarmDatabase;
use App\Farm\FarmProvisioner;
use App\Farm\Farms;
use App\Http\ApiError;
use Carbon\CarbonImmutable;
use Illuminate\Console\Command;
use Illuminate\Support\Str;

/**
 * Mooiplaas: a demo farm modelled on the Bekfontein pilot (ADR 0001), for the exit checklists (see
 * infra/seed/README.md). Not real data: litchi, peak picking 1 Sep to 31 Dec.
 *
 * Re-runnable: a second run empties the demo farm's own database and fills it again, and touches no
 * other farm. The first run creates the farm, and with it its database (FARM_DB_AUTO_CREATE, or the
 * --db-* options on cPanel).
 */
final class Seed extends Command
{
    public const ORG_NAME = 'Demo Organisasie';

    private const FARM_NAME = 'Mooiplaas';

    private const ADMIN_EMAIL = 'admin@mooiplaas.test';

    private const OWNER_EMAIL = 'eienaar@mooiplaas.test';

    private const PASSWORD = 'mooi1234';

    /** Licensed, plus one left out so the unlicensed-QR test has something to fail against. */
    private const LICENSED = ['veldnotas', 'boord', 'span', 'stoor', 'water', 'werkswinkel'];

    private const UNLICENSED = 'kudde';

    /** Every farm table, children first. */
    public const FARM_TABLES = [
        'audit_log', 'held_writes', 'fuel_logs', 'work_orders', 'meter_readings', 'stock_moves', 'attendance_punches',
        'harvest_events', 'notes', 'piece_rates', 'water_points', 'stock_items', 'seasons', 'device_modules',
        'pairing_tokens', 'device_assignments', 'devices', 'farm_memberships', 'camps', 'blocks', 'assets', 'people',
    ];

    protected $signature = 'plaashek:seed
        {--lang=af : The farm\'s screen language, af or en}
        {--db-name= : On cPanel: the demo farm\'s database, made in the Database Wizard}
        {--db-user=}
        {--db-password=}';

    protected $description = 'Create or reset the Mooiplaas demo farm';

    public function handle(FarmProvisioner $provisioner, FarmDatabase $farms): int
    {
        $language = (string) $this->option('lang');
        if (! in_array($language, ['af', 'en'], true)) {
            $this->error("Unknown --lang: {$language} (af or en)");

            return self::FAILURE;
        }

        $central = Farms::central();
        $farm = $central->table('farms')
            ->join('organisations', 'organisations.id', '=', 'farms.organisation_id')
            ->where('organisations.name', self::ORG_NAME)
            ->where('farms.name', self::FARM_NAME)
            ->first(['farms.*']);

        if (! $farm) {
            $database = $this->option('db-name') ? [
                'name' => (string) $this->option('db-name'),
                'username' => (string) ($this->option('db-user') ?: $this->option('db-name')),
                'password' => (string) ($this->option('db-password') ?? $this->secret('Database password')),
            ] : null;

            try {
                $created = $provisioner->create(self::ORG_NAME, self::FARM_NAME, $language, $database, null);
            } catch (ApiError $e) {
                $this->error($e->getMessage());

                return self::FAILURE;
            }
            $farm = $central->table('farms')->where('id', $created['farm']['id'])->first();
        }

        $provisioner->migrate($farm);
        $db = $farms->useRow($farm);

        // Wipe: the demo farm's own database, and its rows in central. No other farm is reachable here.
        $db->statement('SET FOREIGN_KEY_CHECKS = 0');
        foreach (self::FARM_TABLES as $table) {
            $db->table($table)->delete();
        }
        $db->statement('SET FOREIGN_KEY_CHECKS = 1');
        $central->table('entitlements')->where('farm_id', $farm->id)->delete();
        $central->table('login_directory')->where('farm_id', $farm->id)->delete();

        // Coordinates so the office weather line works out of the box: Nelspruit-ish, like the farm.
        $central->table('farms')->where('id', $farm->id)->update(['language' => $language, 'latitude' => -25.569853, 'longitude' => 31.605606]);

        $person = fn (string $name) => ['id' => (string) Str::uuid7(), 'farm_id' => $farm->id, 'name' => $name];

        // Stamp names only: field workers never log in (plan §3.1).
        $staff = array_map($person, ['Anna April', 'Piet Plaas', 'Sannie Snyman', 'Jan Jantjies']);
        $admin = $person('Bestuurder Botha');
        $owner = $person('Eienaar Erasmus');
        $db->table('people')->insert([...$staff, $admin, $owner]);

        $hash = Passwords::hash(self::PASSWORD);
        foreach ([[$admin, self::ADMIN_EMAIL, 'admin'], [$owner, self::OWNER_EMAIL, 'owner']] as [$who, $email, $role]) {
            $db->table('farm_memberships')->insert(['id' => (string) Str::uuid7(), 'farm_id' => $farm->id, 'person_id' => $who['id'], 'email' => $email, 'password_hash' => $hash, 'role' => $role]);
            $central->table('login_directory')->where('email', $email)->delete();
            $central->table('login_directory')->insert(['email' => $email, 'farm_id' => $farm->id]);
        }

        $blocks = [$person('Blok A'), $person('Blok B')];
        $db->table('blocks')->insert($blocks);
        $db->table('camps')->insert([
            [...$person('Kamp A1'), 'block_id' => $blocks[0]['id']],
            [...$person('Kamp A2'), 'block_id' => $blocks[0]['id']],
            [...$person('Kamp B1'), 'block_id' => $blocks[1]['id']],
        ]);
        $db->table('assets')->insert([$person('Trekker'), $person('Pakhuis')]);

        // Peak litchi picking per ADR 0001 (Bekfontein pilot).
        $year = CarbonImmutable::now()->year;
        $db->table('seasons')->insert([
            ...$person("Lietsjie-oes {$year}"),
            'starts_on' => "{$year}-09-01",
            'ends_on' => "{$year}-12-31",
            'is_active' => true,
        ]);

        $central->table('entitlements')->insert(array_map(
            fn (string $code) => ['id' => (string) Str::uuid7(), 'farm_id' => $farm->id, 'module_code' => $code, 'status' => 'active'],
            self::LICENSED,
        ));

        $this->info('Seeded "'.self::FARM_NAME."\" (farm_id {$farm->id}, database {$farm->db_database})");
        $this->line('  admin login: '.self::ADMIN_EMAIL.' / '.self::PASSWORD);
        $this->line('  owner login: '.self::OWNER_EMAIL.' / '.self::PASSWORD);
        $this->line("  language:    {$language}");
        $this->line('  licensed:    '.implode(', ', self::LICENSED));
        $this->line('  unlicensed:  '.self::UNLICENSED.'  (use this to test that pairing fails)');
        $this->line('  people:      '.implode("\n               ", array_map(fn ($p) => "{$p['name']} ({$p['id']})", $staff)));

        return self::SUCCESS;
    }
}
