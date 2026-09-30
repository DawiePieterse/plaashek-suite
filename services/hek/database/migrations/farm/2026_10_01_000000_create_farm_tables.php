<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * One farm's own database (ADR 0015): its people and office logins, phones, master data, seasons and
 * every capture. The same migrations run on every farm database (`php artisan plaashek:farms-migrate`).
 *
 * Rows keep `farm_id` even though the database already says whose they are: the README's stamp rule,
 * and a later merge or export needs nothing added. There is no `farms` table here to point it at.
 */
return new class extends Migration
{
    public function up(): void
    {
        // A name to stamp records with. No login, no password, no email (plan §6). `kind` splits permanent
        // staff, who may carry a paired phone (ADR 0008), from seasonal pickers with a card (ADR 0009).
        Schema::create('people', function (Blueprint $table) {
            $table->uuid('id')->primary();
            $table->uuid('farm_id');
            $table->string('name');
            $table->enum('kind', ['staff', 'seasonal'])->default('staff');
            // The farm's own number for this person (ADR 0011). Null for anyone never numbered.
            $table->string('worker_number', 32)->nullable();
            // A worker who has left: their captures keep their attribution, new scans do not resolve.
            $table->boolean('active')->default(true);
            $table->dateTime('created_at', 6)->useCurrent();
            // One number, one person. MariaDB lets any number of rows share a null, so this only binds
            // the people who were numbered, as the partial index did on Postgres.
            $table->unique(['farm_id', 'worker_number'], 'people_worker_number_per_farm');
        });

        // Office logins only: Farm Admin Tool (admin) and Owner Module (owner). Plan §3.1.
        Schema::create('farm_memberships', function (Blueprint $table) {
            $table->uuid('id')->primary();
            $table->uuid('farm_id');
            $table->foreignUuid('person_id')->constrained('people');
            $table->string('email')->unique();
            $table->string('password_hash')->nullable();
            $table->enum('role', ['admin', 'owner']);
            $table->dateTime('created_at', 6)->useCurrent();
        });

        Schema::create('devices', function (Blueprint $table) {
            $table->uuid('id')->primary();
            $table->uuid('farm_id');
            $table->string('label')->nullable();
            $table->dateTime('created_at', 6)->useCurrent();
        });

        // Append-only history: a reassignment inserts a row (plan §3.4). Current = latest per device.
        Schema::create('device_assignments', function (Blueprint $table) {
            $table->uuid('id')->primary();
            $table->foreignUuid('device_id')->constrained('devices');
            $table->foreignUuid('person_id')->constrained('people');
            $table->dateTime('assigned_at', 6)->useCurrent();
            $table->foreignUuid('assigned_by')->constrained('farm_memberships');
        });

        // A printed QR slip. Its state is read off the three nullable times (plan §3.4).
        Schema::create('pairing_tokens', function (Blueprint $table) {
            $table->uuid('id')->primary();
            $table->foreignUuid('device_id')->constrained('devices');
            $table->string('module_code', 64);
            $table->string('token', 96)->unique();
            $table->dateTime('printed_at', 6)->useCurrent();
            $table->foreignUuid('printed_by')->constrained('farm_memberships');
            $table->dateTime('expires_at', 6);
            $table->dateTime('used_at', 6)->nullable();
            $table->dateTime('cancelled_at', 6)->nullable();
        });

        // Only exists after a successful scan (plan §6): the device's floor.
        Schema::create('device_modules', function (Blueprint $table) {
            $table->uuid('id')->primary();
            $table->foreignUuid('device_id')->constrained('devices');
            $table->string('module_code', 64);
            $table->dateTime('paired_at', 6)->useCurrent();
            $table->unique(['device_id', 'module_code']);
        });

        Schema::create('blocks', function (Blueprint $table) {
            $table->uuid('id')->primary();
            $table->uuid('farm_id');
            $table->string('name');
            $table->dateTime('created_at', 6)->useCurrent();
        });

        Schema::create('camps', function (Blueprint $table) {
            $table->uuid('id')->primary();
            $table->uuid('farm_id');
            $table->foreignUuid('block_id')->nullable()->constrained('blocks');
            $table->string('name');
            $table->dateTime('created_at', 6)->useCurrent();
        });

        Schema::create('assets', function (Blueprint $table) {
            $table->uuid('id')->primary();
            $table->uuid('farm_id');
            $table->string('name');
            $table->dateTime('created_at', 6)->useCurrent();
        });

        // One active season per farm, held by the database rather than trusted to app code: the stored
        // marker is 1 for the active season and null for the rest, and nulls never clash.
        Schema::create('seasons', function (Blueprint $table) {
            $table->uuid('id')->primary();
            $table->uuid('farm_id');
            $table->string('name');
            $table->date('starts_on');
            $table->date('ends_on');
            $table->boolean('is_active')->default(false);
            $table->dateTime('created_at', 6)->useCurrent();
            $table->tinyInteger('active_marker')->nullable()->storedAs('IF(is_active, 1, NULL)');
            $table->unique(['farm_id', 'active_marker'], 'seasons_one_active_per_farm');
        });

        // Veldnotas (plan §11). Append-only: a note is never edited, only added (ADR 0006).
        Schema::create('notes', function (Blueprint $table) {
            $this->workspaceRow($table);
            $table->text('body');
            $table->foreignUuid('block_id')->nullable()->constrained('blocks');
            $table->double('latitude')->nullable();
            $table->double('longitude')->nullable();
            $table->double('location_accuracy_m')->nullable();
            $table->double('weather_temp')->nullable();
            $table->double('weather_humidity')->nullable();
            $table->string('weather_condition', 32)->nullable();
        });

        // Plan §5: a capture that arrives while its licence is suspended or cancelled is held, never
        // dropped. The unique key makes a retried upload a no-op, as the module tables' primary keys do.
        Schema::create('held_writes', function (Blueprint $table) {
            $table->uuid('id')->primary();
            $table->uuid('farm_id');
            $table->string('module_code', 64);
            $table->uuid('device_id');
            $table->string('entity', 32);
            $table->uuid('entity_id');
            $table->json('payload');
            $table->dateTime('client_time', 6);
            $table->dateTime('received_at', 6)->useCurrent();
            $table->dateTime('released_at', 6)->nullable();
            $table->unique(['entity', 'entity_id']);
        });

        // Boord (plan §11). `picker_id` and `picker_card_code` are the piece-work attribution (ADR 0009).
        Schema::create('harvest_events', function (Blueprint $table) {
            $this->workspaceRow($table);
            $table->foreignUuid('block_id')->constrained('blocks');
            $table->double('weight_kg');
            $table->double('deduction_kg')->nullable();
            $table->double('weather_temp')->nullable();
            $table->double('weather_humidity')->nullable();
            $table->string('weather_condition', 32)->nullable();
            $table->foreignUuid('picker_id')->nullable()->constrained('people');
            $table->string('picker_card_code', 64)->nullable();
        });

        // Span (plan §11). The stamp plus a direction; hours are paired at read time.
        Schema::create('attendance_punches', function (Blueprint $table) {
            $this->workspaceRow($table);
            $table->string('direction', 8);
            $table->double('latitude')->nullable();
            $table->double('longitude')->nullable();
            $table->double('location_accuracy_m')->nullable();
        });

        // What a kilogram is worth, tiered, in integer cents (ADR 0010). A change is a new row.
        Schema::create('piece_rates', function (Blueprint $table) {
            $table->uuid('id')->primary();
            $table->uuid('farm_id');
            $table->foreignUuid('season_id')->constrained('seasons');
            $table->date('effective_from');
            $table->integer('base_cents_per_kg');
            $table->double('target_kg')->nullable();
            $table->integer('bonus_cents_per_kg')->nullable();
            $table->dateTime('created_at', 6)->useCurrent();
        });

        // Stoor's catalog and ledger (docs/stoor-build-scope.md).
        Schema::create('stock_items', function (Blueprint $table) {
            $table->uuid('id')->primary();
            $table->uuid('farm_id');
            $table->string('name');
            $table->string('unit', 32);
            $table->boolean('active')->default(true);
            $table->dateTime('created_at', 6)->useCurrent();
        });

        Schema::create('stock_moves', function (Blueprint $table) {
            $this->workspaceRow($table);
            $table->foreignUuid('item_id')->constrained('stock_items');
            $table->string('direction', 8);
            $table->double('quantity');
            $table->foreignUuid('block_id')->nullable()->constrained('blocks');
            $table->string('note', 200)->nullable();
        });

        // Water's catalog and readings (docs/water-build-scope.md).
        Schema::create('water_points', function (Blueprint $table) {
            $table->uuid('id')->primary();
            $table->uuid('farm_id');
            $table->string('name');
            $table->string('unit', 32);
            $table->boolean('active')->default(true);
            $table->dateTime('created_at', 6)->useCurrent();
        });

        Schema::create('meter_readings', function (Blueprint $table) {
            $this->workspaceRow($table);
            $table->foreignUuid('water_point_id')->constrained('water_points');
            $table->double('reading');
            $table->string('note', 200)->nullable();
        });

        // Werkswinkel (docs/werkswinkel-build-scope.md): two append-only rows per job, and fill-ups.
        Schema::create('work_orders', function (Blueprint $table) {
            $this->workspaceRow($table);
            $table->foreignUuid('asset_id')->constrained('assets');
            $table->string('event', 8);
            $table->string('description', 500)->nullable();
        });

        Schema::create('fuel_logs', function (Blueprint $table) {
            $this->workspaceRow($table);
            $table->foreignUuid('asset_id')->constrained('assets');
            $table->double('litres');
            $table->double('meter_reading')->nullable();
            $table->string('note', 200)->nullable();
        });

        // The farm's own actions: QR prints, revokes, edits (plan §6). Management's are in `central`.
        Schema::create('audit_log', function (Blueprint $table) {
            $table->uuid('id')->primary();
            $table->string('actor');
            $table->enum('actor_type', ['farm', 'staff']);
            $table->string('action');
            $table->string('target');
            $table->uuid('farm_id')->nullable();
            $table->dateTime('at', 6)->useCurrent();
        });
    }

    public function down(): void
    {
        foreach ([
            'audit_log', 'fuel_logs', 'work_orders', 'meter_readings', 'water_points', 'stock_moves', 'stock_items',
            'piece_rates', 'attendance_punches', 'harvest_events', 'held_writes', 'notes', 'seasons', 'assets',
            'camps', 'blocks', 'device_modules', 'pairing_tokens', 'device_assignments', 'devices',
            'farm_memberships', 'people',
        ] as $table) {
            Schema::dropIfExists($table);
        }
    }

    /** The stamp every capture table carries (plan §6, docs/seasons-and-stamping.md). */
    private function workspaceRow(Blueprint $table): void
    {
        $table->uuid('id')->primary();
        $table->uuid('farm_id');
        $table->string('module_code', 64);
        // Resolved on the device from its synced active season. Null for season-less modules.
        $table->uuid('season_id')->nullable();
        // The person assigned to the device at save time, not a logged-in user.
        $table->uuid('created_by');
        $table->uuid('device_id');
        $table->dateTime('created_at', 6)->useCurrent();
        $table->dateTime('updated_at', 6)->useCurrent();
        $table->dateTime('revoked_at', 6)->nullable();
        $table->integer('rev')->default(1);
    }
};
