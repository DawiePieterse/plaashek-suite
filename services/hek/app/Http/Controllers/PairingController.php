<?php

namespace App\Http\Controllers;

use App\Auth\SigningKeys;
use App\Auth\Tickets;
use App\Farm\FarmDatabase;
use App\Farm\Farms;
use App\Farm\PairingTokens;
use App\Http\ApiError;
use App\Support\Rows;
use App\Support\Sql;
use Carbon\CarbonImmutable;
use Illuminate\Database\Connection;
use Illuminate\Http\Request;
use Illuminate\Support\Str;

final class PairingController extends Controller
{
    public function __construct(FarmDatabase $farm, private readonly SigningKeys $keys)
    {
        parent::__construct($farm);
    }

    /**
     * Cancels a pending slip and prints its replacement.
     *
     * @return array<string, mixed>
     */
    public function reprint(Request $request, string $id): array
    {
        $staff = $this->staff($request);
        $db = $this->db();
        $now = CarbonImmutable::now();

        return $db->transaction(function () use ($db, $staff, $id, $now) {
            $old = $this->lockFarmToken($db, $id, $staff->farmId);
            self::requirePending($old, $now);

            $db->table('pairing_tokens')->where('id', $id)->update(['cancelled_at' => Rows::db($now)]);

            $freshId = (string) Str::uuid7();
            $token = PairingTokens::random($this->farm->slug());
            $db->table('pairing_tokens')->insert([
                'id' => $freshId,
                'device_id' => $old->device_id,
                'module_code' => $old->module_code,
                'token' => $token,
                'printed_by' => $staff->farmMembershipId,
                'expires_at' => Rows::db(PairingTokens::expiry($now)),
            ]);

            Farms::audit($db, $staff->farmMembershipId, 'reprint_pairing_token', $freshId, $staff->farmId);

            return ['pairingToken' => [...Rows::one($db->table('pairing_tokens')->where('id', $freshId)->first()), 'qrUrl' => PairingTokens::qrUrl($token)]];
        });
    }

    /**
     * @return array<string, mixed>
     */
    public function cancel(Request $request, string $id): array
    {
        $staff = $this->staff($request);
        $db = $this->db();
        $now = CarbonImmutable::now();

        return $db->transaction(function () use ($db, $staff, $id, $now) {
            self::requirePending($this->lockFarmToken($db, $id, $staff->farmId), $now);

            $db->table('pairing_tokens')->where('id', $id)->update(['cancelled_at' => Rows::db($now)]);

            Farms::audit($db, $staff->farmMembershipId, 'cancel_pairing_token', $id, $staff->farmId);

            return ['pairingToken' => ['id' => $id, 'cancelledAt' => Rows::iso($now)]];
        });
    }

    /**
     * The printed QR link: a bearer credential, not a staff action (plan §3.4, §10). The token's slug
     * picks the farm database; the rest has to match a pending slip in it.
     *
     * @return array<string, mixed>
     */
    public function pair(string $token): array
    {
        $slug = PairingTokens::slugOf($token);
        if ($slug === null) {
            throw ApiError::notFound();
        }

        $db = $this->farm->useSlug($slug);
        $farmId = $this->farm->farmId();
        $now = CarbonImmutable::now();

        return $db->transaction(function () use ($db, $farmId, $token, $now) {
            $row = $db->table('pairing_tokens')
                ->join('devices', 'devices.id', '=', 'pairing_tokens.device_id')
                ->where('pairing_tokens.token', $token)
                ->where('devices.farm_id', $farmId)
                ->lockForUpdate()
                ->first(['pairing_tokens.*']);
            if (! $row) {
                throw ApiError::notFound();
            }

            self::requirePending($row, $now);

            $ceiling = Farms::activeModuleCodes($farmId);
            if (! in_array($row->module_code, $ceiling, true)) {
                throw ApiError::forbidden('not_licensed', "Farm is not licensed for module: {$row->module_code}");
            }

            $db->table('pairing_tokens')->where('id', $row->id)->update(['used_at' => Rows::db($now)]);

            Sql::insertIfAbsent($db, 'device_modules', [
                'id' => (string) Str::uuid7(),
                'device_id' => $row->device_id,
                'module_code' => $row->module_code,
            ]);

            $floor = $db->table('device_modules')->where('device_id', $row->device_id)->pluck('module_code')->all();

            $ticket = Tickets::mint(
                $this->keys,
                $farmId,
                $row->device_id,
                $ceiling,
                $floor,
                Farms::language($farmId),
                Farms::activeSeasonId($db, $farmId),
                $now,
            );

            Farms::audit($db, "device:{$row->device_id}", 'pair', $row->module_code, $farmId);

            return [
                'ticket' => $ticket,
                'farmId' => $farmId,
                'deviceId' => $row->device_id,
                'modules' => array_values(array_filter($floor, fn (string $m) => in_array($m, $ceiling, true))),
            ];
        });
    }

    /** Locks the row: callers change it, so the pending check must not race a scan or a reprint. */
    private function lockFarmToken(Connection $db, string $id, string $farmId): object
    {
        $row = Str::isUuid($id)
            ? $db->table('pairing_tokens')
                ->join('devices', 'devices.id', '=', 'pairing_tokens.device_id')
                ->where('pairing_tokens.id', $id)
                ->where('devices.farm_id', $farmId)
                ->lockForUpdate()
                ->first(['pairing_tokens.*'])
            : null;
        if (! $row) {
            throw ApiError::notFound();
        }

        return $row;
    }

    private static function requirePending(object $row, CarbonImmutable $now): void
    {
        match (PairingTokens::state($row, $now)) {
            'used' => throw ApiError::conflict('token_used', 'This pairing token has already been scanned'),
            'cancelled' => throw ApiError::gone('token_cancelled', 'This pairing token was cancelled'),
            'expired' => throw ApiError::gone('token_expired', 'This pairing token has expired'),
            default => null,
        };
    }
}
