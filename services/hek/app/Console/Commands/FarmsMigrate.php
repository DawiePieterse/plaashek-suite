<?php

namespace App\Console\Commands;

use App\Farm\FarmProvisioner;
use App\Farm\Farms;
use Illuminate\Console\Command;
use Throwable;

/** Runs pending farm migrations on every farm's database. Part of every update, after `migrate`. */
final class FarmsMigrate extends Command
{
    protected $signature = 'plaashek:farms-migrate';

    protected $description = 'Run pending migrations on every farm database';

    public function handle(FarmProvisioner $provisioner): int
    {
        $failed = 0;

        foreach (Farms::central()->table('farms')->orderBy('name')->get() as $farm) {
            try {
                $provisioner->migrate($farm);
                $this->line("{$farm->name} ({$farm->db_database}): up to date");
            } catch (Throwable $e) {
                $failed++;
                $this->error("{$farm->name} ({$farm->db_database}): {$e->getMessage()}");
            }
        }

        return $failed === 0 ? self::SUCCESS : self::FAILURE;
    }
}
