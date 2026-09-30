<?php

namespace App\Console\Commands;

use App\Farm\Farms;
use Illuminate\Console\Command;
use Illuminate\Support\Facades\Crypt;
use Symfony\Component\Process\Process;

/**
 * Nightly dump of the central database and every farm database, each to its own gzipped file, keeping 30
 * days (infra/backup/README.md). One file per farm means one farm can be restored, or handed its data,
 * without touching another. Run from cron; copy the folder off the server.
 */
final class Backup extends Command
{
    protected $signature = 'plaashek:backup {--dir= : Where the dumps go (default storage/backups)} {--keep-days=30}';

    protected $description = 'Dump the central and every farm database';

    public function handle(): int
    {
        $dir = rtrim((string) ($this->option('dir') ?: storage_path('backups')), '/');
        if (! is_dir($dir) && ! mkdir($dir, 0700, true)) {
            $this->error("Cannot create {$dir}");

            return self::FAILURE;
        }

        $central = Farms::central();
        $stamp = now()->utc()->format('Ymd-His');
        $targets = [['central', (string) $central->getDatabaseName(), (string) $central->getConfig('username'), (string) $central->getConfig('password')]];

        foreach ($central->table('farms')->orderBy('slug')->get() as $farm) {
            $targets[] = ["farm-{$farm->slug}", $farm->db_database, $farm->db_username, Crypt::decryptString($farm->db_password)];
        }

        $failed = 0;
        foreach ($targets as [$label, $database, $user, $password]) {
            $file = "{$dir}/{$label}-{$stamp}.sql";
            // To a file first, then gzip: a failed dump fails the command instead of leaving a tiny .gz.
            $process = Process::fromShellCommandline(
                'mysqldump --single-transaction --routines --no-tablespaces -h "$HOST" -P "$PORT" -u "$USER" "$DATABASE" > "$FILE" && gzip -f "$FILE"',
                null,
                ['HOST' => (string) $central->getConfig('host'), 'PORT' => (string) $central->getConfig('port'), 'USER' => $user, 'MYSQL_PWD' => $password, 'DATABASE' => $database, 'FILE' => $file],
            );
            $process->setTimeout(3600)->run();
            $file .= '.gz';

            if (! $process->isSuccessful() || ! is_file($file)) {
                @unlink(substr($file, 0, -3));
                $failed++;
                $this->error("{$label}: ".trim($process->getErrorOutput()));
            } else {
                $this->line("{$label}: {$file}");
            }
        }

        // Keep the last N days.
        $cutoff = time() - (int) $this->option('keep-days') * 86400;
        foreach (glob("{$dir}/*.sql.gz") ?: [] as $old) {
            if (filemtime($old) < $cutoff) {
                unlink($old);
            }
        }

        return $failed === 0 ? self::SUCCESS : self::FAILURE;
    }
}
