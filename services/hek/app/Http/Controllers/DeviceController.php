<?php

namespace App\Http\Controllers;

use App\Farm\Farms;
use App\Farm\PairingTokens;
use App\Http\ApiError;
use App\Http\Input;
use App\Support\Rows;
use Carbon\CarbonImmutable;
use Illuminate\Http\Request;
use Illuminate\Support\Str;

final class DeviceController extends Controller
{
    /**
     * @return array<string, mixed>
     */
    public function index(Request $request): array
    {
        $farmId = $this->staff($request)->farmId;
        $db = $this->db();

        $devices = $db->table('devices')->where('farm_id', $farmId)->get();
        if ($devices->isEmpty()) {
            return ['devices' => []];
        }

        $ids = $devices->pluck('id')->all();

        // Ascending, then overwritten: the last write per device is its latest assignment.
        $latest = [];
        $assignments = $db->table('device_assignments')
            ->join('people', 'people.id', '=', 'device_assignments.person_id')
            ->whereIn('device_assignments.device_id', $ids)
            ->orderBy('device_assignments.assigned_at')
            ->get(['device_assignments.device_id', 'people.id as person_id', 'people.name as person_name']);
        foreach ($assignments as $a) {
            $latest[$a->device_id] = ['personId' => $a->person_id, 'personName' => $a->person_name];
        }

        $modules = [];
        foreach ($db->table('device_modules')->whereIn('device_id', $ids)->get() as $m) {
            $modules[$m->device_id][] = $m->module_code;
        }

        $now = CarbonImmutable::now();
        $pending = [];
        foreach ($db->table('pairing_tokens')->whereIn('device_id', $ids)->whereNull('used_at')->whereNull('cancelled_at')->get() as $t) {
            if (CarbonImmutable::parse($t->expires_at, 'UTC') > $now) {
                $pending[$t->device_id][] = [
                    'id' => $t->id,
                    'moduleCode' => $t->module_code,
                    'expiresAt' => Rows::iso($t->expires_at),
                    'printedAt' => Rows::iso($t->printed_at),
                ];
            }
        }

        return ['devices' => $devices->map(fn (object $device) => [
            'id' => $device->id,
            'label' => $device->label,
            'createdAt' => Rows::iso($device->created_at),
            'assignedPerson' => $latest[$device->id] ?? null,
            'modules' => $modules[$device->id] ?? [],
            'pendingPairingTokens' => $pending[$device->id] ?? [],
        ])->all()];
    }

    /**
     * @return array<string, mixed>
     */
    public function store(Request $request): array
    {
        $staff = $this->staff($request);
        $body = Input::parse([
            'personId' => 'uuid',
            'moduleCode' => 'string',
            'label' => 'optional|nullable|string',
        ], $this->body($request));

        $db = $this->db();
        Farms::assertOwns($db, 'people', $body['personId'], $staff->farmId);
        $this->assertLicensed($staff->farmId, $body['moduleCode']);

        $now = CarbonImmutable::now();

        return $db->transaction(function () use ($db, $staff, $body, $now) {
            $deviceId = (string) Str::uuid7();
            $db->table('devices')->insert(['id' => $deviceId, 'farm_id' => $staff->farmId, 'label' => $body['label'] ?? null]);

            $db->table('device_assignments')->insert([
                'id' => (string) Str::uuid7(),
                'device_id' => $deviceId,
                'person_id' => $body['personId'],
                'assigned_by' => $staff->farmMembershipId,
            ]);

            $token = $this->printToken($deviceId, $body['moduleCode'], $staff->farmMembershipId, $now);

            Farms::audit($db, $staff->farmMembershipId, 'add_device', $deviceId, $staff->farmId);

            return ['device' => Rows::one($db->table('devices')->where('id', $deviceId)->first()), 'pairingToken' => $token];
        });
    }

    /**
     * Another module's QR for a phone that is already paired for something.
     *
     * @return array<string, mixed>
     */
    public function addApp(Request $request, string $deviceId): array
    {
        $staff = $this->staff($request);
        $body = Input::parse(['moduleCode' => 'string'], $this->body($request));

        $db = $this->db();
        Farms::assertOwns($db, 'devices', $deviceId, $staff->farmId);
        $this->assertLicensed($staff->farmId, $body['moduleCode']);

        $now = CarbonImmutable::now();

        return $db->transaction(function () use ($db, $staff, $body, $deviceId, $now) {
            $token = $this->printToken($deviceId, $body['moduleCode'], $staff->farmMembershipId, $now);
            Farms::audit($db, $staff->farmMembershipId, 'add_app', $deviceId, $staff->farmId);

            return ['pairingToken' => $token];
        });
    }

    /**
     * Takes every module off the phone and cancels its unscanned QRs. It lands at the phone's next sync
     * or ticket refresh (plan §3.5).
     *
     * @return array<string, mixed>
     */
    public function revoke(Request $request, string $deviceId): array
    {
        $staff = $this->staff($request);
        $db = $this->db();
        Farms::assertOwns($db, 'devices', $deviceId, $staff->farmId);

        return $db->transaction(function () use ($db, $staff, $deviceId) {
            $revoked = $db->table('device_modules')->where('device_id', $deviceId)->lockForUpdate()->pluck('module_code')->all();
            $db->table('device_modules')->where('device_id', $deviceId)->delete();

            $db->table('pairing_tokens')
                ->where('device_id', $deviceId)
                ->whereNull('used_at')
                ->whereNull('cancelled_at')
                ->update(['cancelled_at' => Rows::db(CarbonImmutable::now())]);

            Farms::audit($db, $staff->farmMembershipId, 'revoke', $deviceId, $staff->farmId);

            return ['deviceId' => $deviceId, 'revokedModules' => $revoked];
        });
    }

    private function assertLicensed(string $farmId, string $moduleCode): void
    {
        if (! in_array($moduleCode, Farms::activeModuleCodes($farmId), true)) {
            throw ApiError::forbidden('not_licensed', "Farm is not licensed for module: {$moduleCode}");
        }
    }

    /**
     * A fresh QR slip for one device and module, with its link.
     *
     * @return array<string, mixed>
     */
    private function printToken(string $deviceId, string $moduleCode, string $printedBy, CarbonImmutable $now): array
    {
        $db = $this->db();
        $id = (string) Str::uuid7();
        $token = PairingTokens::random($this->farm->slug());

        $db->table('pairing_tokens')->insert([
            'id' => $id,
            'device_id' => $deviceId,
            'module_code' => $moduleCode,
            'token' => $token,
            'printed_by' => $printedBy,
            'expires_at' => Rows::db(PairingTokens::expiry($now)),
        ]);

        return [...Rows::one($db->table('pairing_tokens')->where('id', $id)->first()), 'qrUrl' => PairingTokens::qrUrl($token)];
    }
}
