<?php

namespace App\Console\Commands;

use App\Auth\SigningKeys;
use Illuminate\Console\Command;

/**
 * The three secrets the API signs with, written into `.env` if they are not there yet (or printed, with
 * `--show`). Replacing them signs everyone out and voids every printed pairing QR's ticket, so an existing
 * value is kept unless `--force`.
 */
final class Keys extends Command
{
    protected $signature = 'plaashek:keys {--show : Print the lines instead of writing .env} {--force : Replace values already set}';

    protected $description = 'Generate the ticket signing key and the two session secrets';

    public function handle(): int
    {
        $values = [
            'TICKET_SIGNING_KEY_JWK' => "'".SigningKeys::generate()->privateJwk()."'",
            'STAFF_SESSION_SECRET' => base64_encode(random_bytes(32)),
            'MANAGEMENT_SESSION_SECRET' => base64_encode(random_bytes(32)),
        ];

        if ($this->option('show')) {
            foreach ($values as $key => $value) {
                $this->line("{$key}={$value}");
            }

            return self::SUCCESS;
        }

        $path = base_path('.env');
        if (! is_file($path)) {
            $this->error('No .env file. Copy .env.example to .env first.');

            return self::FAILURE;
        }

        $env = (string) file_get_contents($path);
        foreach ($values as $key => $value) {
            $pattern = '/^'.preg_quote($key, '/').'=(.*)$/m';

            if (preg_match($pattern, $env, $match) && trim($match[1]) !== '' && ! $this->option('force')) {
                $this->line("{$key} already set, kept.");

                continue;
            }

            $line = "{$key}={$value}";
            $env = preg_match($pattern, $env) ? (string) preg_replace($pattern, str_replace(['\\', '$'], ['\\\\', '\\$'], $line), $env) : rtrim($env)."\n{$line}\n";
            $this->info("{$key} written.");
        }

        file_put_contents($path, $env);

        return self::SUCCESS;
    }
}
