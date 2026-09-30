<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * The central database (ADR 0015): what Plaashek Management owns across farms, and the two lookups that
 * find a farm before anyone has a session: the login directory and each farm's own database.
 * Nothing a farm captures lives here.
 */
return new class extends Migration
{
    public function up(): void
    {
        Schema::create('organisations', function (Blueprint $table) {
            $table->uuid('id')->primary();
            $table->string('name');
            $table->dateTime('created_at', 6)->useCurrent();
        });

        Schema::create('farms', function (Blueprint $table) {
            $table->uuid('id')->primary();
            $table->foreignUuid('organisation_id')->constrained('organisations');
            $table->string('name');
            // Picks the farm's database, and prefixes its pairing tokens so an unauthenticated scan finds it.
            $table->string('slug', 16)->unique();
            // Chosen when the farm is set up. Every screen the farm sees, office and phone, follows it.
            $table->enum('language', ['af', 'en'])->default('af');
            // Where the farm is, for the office weather line. Null until the Farm Admin Tool sets it.
            $table->double('latitude')->nullable();
            $table->double('longitude')->nullable();
            // The farm's own database. The password is encrypted with APP_KEY.
            $table->string('db_database', 64);
            $table->string('db_username', 64);
            $table->text('db_password');
            $table->dateTime('created_at', 6)->useCurrent();
        });

        Schema::create('entitlements', function (Blueprint $table) {
            $table->uuid('id')->primary();
            $table->foreignUuid('farm_id')->constrained('farms');
            // Not an enum: must allow `custom:*` (plan §4.5).
            $table->string('module_code', 64);
            $table->enum('status', ['active', 'grace', 'suspended', 'cancelled'])->default('active');
            $table->dateTime('valid_from', 6)->useCurrent();
            $table->dateTime('valid_until', 6)->nullable();
            // Fixed default per ADR 0003, not a per-farm setting.
            $table->integer('grace_days')->default(14);
            // How it was activated, e.g. "manual" this year (ADR 0004).
            $table->string('source', 32)->default('manual');
            $table->dateTime('created_at', 6)->useCurrent();
            $table->unique(['farm_id', 'module_code']);
        });

        // Plaashek's own staff: a separate cross-farm login, never farm-scoped (plan §3.1, §4.1).
        Schema::create('plaashek_staff', function (Blueprint $table) {
            $table->uuid('id')->primary();
            $table->string('email')->unique();
            $table->string('password_hash');
            $table->dateTime('created_at', 6)->useCurrent();
        });

        // Which farm an office email belongs to, so a login knows which database to check the password
        // in. The login itself (password, role, person) stays in the farm's database.
        Schema::create('login_directory', function (Blueprint $table) {
            $table->string('email')->primary();
            $table->foreignUuid('farm_id')->constrained('farms');
            $table->dateTime('created_at', 6)->useCurrent();
        });

        // Plaashek Management's own actions. A farm's actions are logged in the farm's database.
        Schema::create('audit_log', function (Blueprint $table) {
            $table->uuid('id')->primary();
            $table->string('actor');
            $table->enum('actor_type', ['farm', 'staff']);
            $table->string('action');
            $table->string('target');
            $table->foreignUuid('farm_id')->nullable()->constrained('farms');
            $table->dateTime('at', 6)->useCurrent();
        });
    }

    public function down(): void
    {
        foreach (['audit_log', 'login_directory', 'plaashek_staff', 'entitlements', 'farms', 'organisations'] as $table) {
            Schema::dropIfExists($table);
        }
    }
};
