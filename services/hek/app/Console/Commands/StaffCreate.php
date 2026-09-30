<?php

namespace App\Console\Commands;

use App\Auth\Passwords;
use App\Farm\Farms;
use Illuminate\Console\Command;
use Illuminate\Support\Str;

/**
 * Bootstraps or resets one Plaashek Management login: the console has no self-signup (plan §3.1). Safe to
 * re-run to rotate a password.
 */
final class StaffCreate extends Command
{
    protected $signature = 'plaashek:staff-create {--email=} {--password=}';

    protected $description = 'Create a Plaashek Management login, or set its password';

    public function handle(): int
    {
        $email = (string) ($this->option('email') ?: $this->ask('Email'));
        $password = (string) ($this->option('password') ?: $this->secret('Password'));

        if (! filter_var($email, FILTER_VALIDATE_EMAIL) || strlen($password) < 8) {
            $this->error('Give a valid email and a password of at least 8 characters.');

            return self::FAILURE;
        }

        $central = Farms::central();
        $existing = $central->table('plaashek_staff')->where('email', $email)->value('id');

        if ($existing) {
            $central->table('plaashek_staff')->where('id', $existing)->update(['password_hash' => Passwords::hash($password)]);
            $this->info("Password updated for {$email}");
        } else {
            $central->table('plaashek_staff')->insert(['id' => (string) Str::uuid7(), 'email' => $email, 'password_hash' => Passwords::hash($password)]);
            $this->info("Created Plaashek Management login: {$email}");
        }

        return self::SUCCESS;
    }
}
