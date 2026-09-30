<?php

namespace App\Http\Controllers;

use App\Farm\Farms;
use App\Farm\WorkerNumbers;
use App\Http\ApiError;
use App\Http\Input;
use App\Support\Rows;
use App\Support\Sql;
use Carbon\CarbonImmutable;
use Illuminate\Database\Connection;
use Illuminate\Http\Request;
use Illuminate\Support\Str;

/**
 * The phone's outbox drains here (`apps/field/src/queue.ts`). Everything identifying (farm, device,
 * person) is stamped from the ticket, never read from the upload.
 */
final class SyncController extends Controller
{
    /** Which module owns each entity a phone can upload (plan §11). */
    public const MODULE_CODE = [
        'notes' => 'veldnotas',
        'harvest_events' => 'boord',
        'attendance_punches' => 'span',
        'stock_moves' => 'stoor',
        'meter_readings' => 'water',
        'work_orders' => 'werkswinkel',
        'fuel_logs' => 'werkswinkel',
    ];

    /** Water and Werkswinkel are season-less (plan §6, §8): their ops must say so. */
    private const SEASONLESS = ['meter_readings', 'work_orders', 'fuel_logs'];

    /** What each entity's payload may say. */
    private const PAYLOADS = [
        'notes' => [
            'body' => 'string|min:1',
            'block_id' => 'optional|nullable|uuid',
            'latitude' => 'optional|nullable|number',
            'longitude' => 'optional|nullable|number',
            'location_accuracy_m' => 'optional|nullable|number',
            'weather_temp' => 'optional|nullable|number',
            'weather_humidity' => 'optional|nullable|number',
            'weather_condition' => 'optional|nullable|string',
        ],
        'harvest_events' => [
            'block_id' => 'uuid',
            'weight_kg' => 'number|positive',
            'deduction_kg' => 'optional|nullable|number',
            'picker_card_code' => 'optional|nullable|string|min:1|max:64',
            'weather_temp' => 'optional|nullable|number',
            'weather_humidity' => 'optional|nullable|number',
            'weather_condition' => 'optional|nullable|string',
        ],
        'attendance_punches' => [
            'direction' => 'in:in,out',
            'latitude' => 'optional|nullable|number',
            'longitude' => 'optional|nullable|number',
            'location_accuracy_m' => 'optional|nullable|number',
        ],
        'stock_moves' => [
            'item_id' => 'uuid',
            'direction' => 'in:in,out',
            'quantity' => 'number|positive',
            'block_id' => 'optional|nullable|uuid',
            'note' => 'optional|nullable|string|max:200',
        ],
        'meter_readings' => [
            'water_point_id' => 'uuid',
            'reading' => 'number',
            'note' => 'optional|nullable|string|max:200',
        ],
        'work_orders' => [
            'asset_id' => 'uuid',
            'event' => 'in:opened,closed',
            'description' => 'optional|nullable|string|max:500',
        ],
        'fuel_logs' => [
            'asset_id' => 'uuid',
            'litres' => 'number|positive',
            'meter_reading' => 'optional|nullable|number',
            'note' => 'optional|nullable|string|max:200',
        ],
    ];

    /**
     * @return array<string, mixed>
     */
    public function upload(Request $request): array
    {
        $claims = $this->device($request);
        $ops = self::parseOps($this->body($request));
        $db = $this->db();

        // A batch only touches the modules this phone has open; check each once. The floor is read live,
        // not from the ticket: a revoke lands at the next sync, and this is that sync (plan §3.5).
        $heldModules = [];
        foreach (array_unique(array_map(fn (array $op) => self::MODULE_CODE[$op['entity']], $ops)) as $moduleCode) {
            $paired = $db->table('device_modules')->where('device_id', $claims->deviceId)->where('module_code', $moduleCode)->exists();
            if (! $paired) {
                throw ApiError::forbidden('not_paired', "This device is not paired for module: {$moduleCode}");
            }

            $status = Farms::moduleStatus($claims->farmId, $moduleCode);
            if ($status === null) {
                throw ApiError::forbidden('not_licensed', "Farm is not licensed for module: {$moduleCode}");
            }

            // Never drop a capture over an invoice: hold it instead (plan §5).
            if ($status === 'suspended' || $status === 'cancelled') {
                $heldModules[$moduleCode] = true;
            }
        }

        return $db->transaction(function () use ($db, $claims, $ops, $heldModules) {
            $accepted = [];
            $held = false;

            foreach ($ops as $op) {
                $moduleCode = self::MODULE_CODE[$op['entity']];
                $clientTime = Rows::db($op['client_time']);

                if (isset($heldModules[$moduleCode])) {
                    $held = true;
                    Sql::insertIfAbsent($db, 'held_writes', [
                        'id' => (string) Str::uuid7(),
                        'farm_id' => $claims->farmId,
                        'module_code' => $moduleCode,
                        'device_id' => $claims->deviceId,
                        'entity' => $op['entity'],
                        'entity_id' => $op['entity_id'],
                        'payload' => json_encode((object) $op['payload']),
                        'client_time' => $clientTime,
                    ]);
                    $accepted[] = $op['entity_id'];

                    continue;
                }

                $this->apply($db, $claims->farmId, $claims->deviceId, $op, $clientTime);
                $accepted[] = $op['entity_id'];
            }

            return ['accepted' => $accepted, 'held' => $held, 'serverTime' => Rows::iso(CarbonImmutable::now())];
        });
    }

    /**
     * Every capture is append-only (plan §7), so the same id arriving twice is a retry, not a second
     * capture: inserted if absent, in one statement, with no read-then-write race.
     *
     * @param  array<string, mixed>  $op
     */
    private function apply(Connection $db, string $farmId, string $deviceId, array $op, string $clientTime): void
    {
        $p = $op['payload'];
        $createdBy = self::personAtSaveTime($db, $deviceId, $clientTime);
        if (! $createdBy) {
            throw ApiError::forbidden('device_unassigned', 'This device has no assigned person');
        }

        $row = [
            'id' => $op['entity_id'],
            'farm_id' => $farmId,
            'module_code' => self::MODULE_CODE[$op['entity']],
            'season_id' => $op['season_id'],
            'created_by' => $createdBy,
            'device_id' => $deviceId,
            'created_at' => $clientTime,
            'updated_at' => $clientTime,
        ];

        $row += match ($op['entity']) {
            'notes' => [
                'body' => $p['body'],
                'block_id' => $p['block_id'] ?? null,
                'latitude' => $p['latitude'] ?? null,
                'longitude' => $p['longitude'] ?? null,
                'location_accuracy_m' => $p['location_accuracy_m'] ?? null,
                'weather_temp' => $p['weather_temp'] ?? null,
                'weather_humidity' => $p['weather_humidity'] ?? null,
                'weather_condition' => $p['weather_condition'] ?? null,
            ],
            'harvest_events' => self::harvestColumns($db, $farmId, $p),
            'attendance_punches' => [
                'direction' => $p['direction'],
                'latitude' => $p['latitude'] ?? null,
                'longitude' => $p['longitude'] ?? null,
                'location_accuracy_m' => $p['location_accuracy_m'] ?? null,
            ],
            'stock_moves' => [
                'item_id' => $p['item_id'],
                'direction' => $p['direction'],
                'quantity' => $p['quantity'],
                'block_id' => $p['block_id'] ?? null,
                'note' => $p['note'] ?? null,
            ],
            'meter_readings' => [
                'water_point_id' => $p['water_point_id'],
                'reading' => $p['reading'],
                'note' => $p['note'] ?? null,
            ],
            'work_orders' => [
                'asset_id' => $p['asset_id'],
                'event' => $p['event'],
                'description' => $p['description'] ?? null,
            ],
            'fuel_logs' => [
                'asset_id' => $p['asset_id'],
                'litres' => $p['litres'],
                'meter_reading' => $p['meter_reading'] ?? null,
                'note' => $p['note'] ?? null,
            ],
            // parseOps only lets the entities above through; a new one added there needs a case here.
            default => throw new \LogicException("Unhandled sync entity: {$op['entity']}"),
        };

        Sql::insertIfAbsent($db, $op['entity'], $row);
    }

    /**
     * A crate, and whose card was scanned for it (ADR 0009, 0011). The phone sends only the number it
     * read, never a person id, so a device cannot assert who picked a crate: this is the one place a
     * number becomes an attribution, and it will not credit a worker who has left.
     *
     * @param  array<string, mixed>  $p
     * @return array<string, mixed>
     */
    private static function harvestColumns(Connection $db, string $farmId, array $p): array
    {
        $scanned = isset($p['picker_card_code']) ? WorkerNumbers::normalise($p['picker_card_code']) : null;
        $pickerId = $scanned
            ? $db->table('people')->where('farm_id', $farmId)->where('worker_number', $scanned)->where('active', true)->value('id')
            : null;

        return [
            'block_id' => $p['block_id'],
            'weight_kg' => $p['weight_kg'],
            'deduction_kg' => $p['deduction_kg'] ?? null,
            'picker_id' => $pickerId,
            'picker_card_code' => $scanned,
            'weather_temp' => $p['weather_temp'] ?? null,
            'weather_humidity' => $p['weather_humidity'] ?? null,
            'weather_condition' => $p['weather_condition'] ?? null,
        ];
    }

    /**
     * Who the phone was assigned to when the capture was made, not when it reached signal: assignments
     * are append-only, so a reassignment next week does not take last week's captures (plan §3.2). A
     * capture dated before the first assignment (a phone clock behind) falls back to the earliest one.
     */
    private static function personAtSaveTime(Connection $db, string $deviceId, string $clientTime): ?string
    {
        return $db->table('device_assignments')
            ->where('device_id', $deviceId)
            ->where('assigned_at', '<=', $clientTime)
            ->orderByDesc('assigned_at')
            ->value('person_id')
            ?? $db->table('device_assignments')->where('device_id', $deviceId)->orderBy('assigned_at')->value('person_id');
    }

    /**
     * `{ops: [...]}`, 1 to 500 of them, each checked against its own entity's shape.
     *
     * @return list<array<string, mixed>>
     */
    private static function parseOps(mixed $body): array
    {
        ['ops' => $ops] = Input::parse(['ops' => 'optional'], $body) + ['ops' => null];

        if (! is_array($ops) || ! array_is_list($ops)) {
            throw ApiError::validation('ops: Expected array');
        }
        if (count($ops) < 1 || count($ops) > 500) {
            throw ApiError::validation('ops: Array must contain between 1 and 500 element(s)');
        }

        return array_map(function (mixed $op, int $i) {
            $entity = is_array($op) ? ($op['entity'] ?? null) : null;
            if (! is_string($entity) || ! isset(self::PAYLOADS[$entity])) {
                throw ApiError::validation("ops.{$i}.entity: Invalid discriminator value");
            }

            $parsed = Input::parse([
                'entity' => 'string',
                'entity_id' => 'uuid',
                'client_time' => 'datetime',
                'season_id' => in_array($entity, self::SEASONLESS, true) ? 'null' : 'nullable|uuid',
                'payload' => 'optional',
            ], $op, "ops.{$i}");

            $parsed['payload'] = Input::parse(self::PAYLOADS[$entity], $parsed['payload'] ?? null, "ops.{$i}.payload");

            return $parsed;
        }, $ops, array_keys($ops));
    }
}
