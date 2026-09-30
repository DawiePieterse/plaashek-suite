<?php

namespace App\Http\Controllers;

use App\Farm\Farms;
use App\Http\ApiError;
use App\Http\Input;
use App\Support\Rows;
use Illuminate\Database\Connection;
use Illuminate\Http\Request;
use Illuminate\Support\Str;

final class SeasonController extends Controller
{
    private const COLUMNS = ['id', 'farm_id', 'name', 'starts_on', 'ends_on', 'is_active', 'created_at'];

    /**
     * @return array<string, mixed>
     */
    public function index(Request $request): array
    {
        return ['seasons' => Rows::all(
            $this->db()->table('seasons')->where('farm_id', $this->staff($request)->farmId)->orderBy('starts_on')->get(self::COLUMNS),
        )];
    }

    /**
     * @return array<string, mixed>
     */
    public function store(Request $request): array
    {
        $staff = $this->staff($request);
        $body = Input::parse([
            'name' => 'string',
            'startsOn' => 'date',
            'endsOn' => 'date',
            'isActive' => 'optional|boolean',
        ], $this->body($request));

        $db = $this->db();

        return $db->transaction(function () use ($db, $staff, $body) {
            $id = (string) Str::uuid7();
            $db->table('seasons')->insert([
                'id' => $id,
                'farm_id' => $staff->farmId,
                'name' => $body['name'],
                'starts_on' => $body['startsOn'],
                'ends_on' => $body['endsOn'],
                'is_active' => false,
            ]);

            if ($body['isActive'] ?? false) {
                self::standDownOthers($db, $staff->farmId, $id);
                $db->table('seasons')->where('id', $id)->update(['is_active' => true]);
            }

            Farms::audit($db, $staff->farmMembershipId, 'create_season', $id, $staff->farmId);

            return ['season' => Rows::one($db->table('seasons')->where('id', $id)->first(self::COLUMNS))];
        });
    }

    /**
     * A pick runs late more often than not: dates and the active flag stay editable (plan §4.2).
     *
     * @return array<string, mixed>
     */
    public function update(Request $request, string $id): array
    {
        $staff = $this->staff($request);
        $body = Input::parse([
            'name' => 'optional|string',
            'startsOn' => 'optional|date',
            'endsOn' => 'optional|date',
            'isActive' => 'optional|boolean',
        ], $this->body($request));
        if ($body === []) {
            throw ApiError::validation('Nothing to update');
        }

        $db = $this->db();

        return $db->transaction(function () use ($db, $staff, $id, $body) {
            Farms::assertOwns($db, 'seasons', $id, $staff->farmId);

            if ($body['isActive'] ?? false) {
                self::standDownOthers($db, $staff->farmId, $id);
            }

            $db->table('seasons')->where('id', $id)->update(array_filter([
                'name' => $body['name'] ?? null,
                'starts_on' => $body['startsOn'] ?? null,
                'ends_on' => $body['endsOn'] ?? null,
            ], fn ($v) => $v !== null) + (array_key_exists('isActive', $body) ? ['is_active' => $body['isActive']] : []));

            Farms::audit($db, $staff->farmMembershipId, 'update_season', $id, $staff->farmId);

            return ['season' => Rows::one($db->table('seasons')->where('id', $id)->first(self::COLUMNS))];
        });
    }

    /**
     * One active season per farm is a unique key, so the old one stands down in the same transaction as
     * the new one stands up; otherwise the database refuses the write rather than the app choosing.
     */
    private static function standDownOthers(Connection $db, string $farmId, string $exceptId): void
    {
        $db->table('seasons')->where('farm_id', $farmId)->where('is_active', true)->where('id', '!=', $exceptId)->update(['is_active' => false]);
    }
}
