<?php

namespace App\Console\Commands;

use App\Farm\FarmProvisioner;
use App\Http\ApiError;
use Illuminate\Console\Command;

/**
 * The command-line twin of "Nuwe plaas" in Plaashek Management. On cPanel, make the database and its
 * user in the Database Wizard first and pass them here; with FARM_DB_AUTO_CREATE the database is made.
 */
final class FarmCreate extends Command
{
    protected $signature = 'plaashek:farm-create
        {--organisation= : Organisation name}
        {--farm= : Farm name}
        {--lang=af : Screen language, af or en}
        {--db-name= : The farm database made in cPanel}
        {--db-user= : Its user}
        {--db-password= : Its password (asked for if left out)}';

    protected $description = 'Create an organisation and farm, and set up the farm\'s own database';

    public function handle(FarmProvisioner $provisioner): int
    {
        $organisation = $this->option('organisation') ?: $this->ask('Organisation');
        $farm = $this->option('farm') ?: $this->ask('Farm name');
        $language = (string) $this->option('lang');

        if (! in_array($language, ['af', 'en'], true)) {
            $this->error('--lang must be af or en');

            return self::FAILURE;
        }

        $database = null;
        if ($this->option('db-name')) {
            $database = [
                'name' => (string) $this->option('db-name'),
                'username' => (string) ($this->option('db-user') ?: $this->option('db-name')),
                'password' => (string) ($this->option('db-password') ?? $this->secret('Database password')),
            ];
        }

        try {
            $result = $provisioner->create((string) $organisation, (string) $farm, $language, $database, null);
        } catch (ApiError $e) {
            $this->error($e->getMessage());

            return self::FAILURE;
        }

        $this->info("Created \"{$result['farm']['name']}\" (farm_id {$result['farm']['id']}) in {$result['organisation']['name']}.");
        $this->line('Next: switch its modules on and give it an office login in Plaashek Management.');

        return self::SUCCESS;
    }
}
