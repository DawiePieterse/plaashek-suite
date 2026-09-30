<?php

namespace App\Farm;

use App\Http\ApiError;
use Illuminate\Database\Connection;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Str;

/**
 * What every route asks about a farm: its language and place (central), its licences (central), its
 * active season and blocks (its own database), and the audit line each write leaves.
 */
final class Farms
{
    public static function central(): Connection
    {
        return DB::connection('central');
    }

    /** English in the database, the farm's own language on screen (plan §6). */
    public static function language(string $farmId): string
    {
        $language = self::central()->table('farms')->where('id', $farmId)->value('language');
        if ($language === null) {
            throw ApiError::notFound();
        }

        return $language;
    }

    /**
     * Both or neither: a latitude without a longitude is no location at all.
     *
     * @return array{lat: float, lon: float}|null
     */
    public static function coordsPair(mixed $latitude, mixed $longitude): ?array
    {
        return $latitude !== null && $longitude !== null ? ['lat' => (float) $latitude, 'lon' => (float) $longitude] : null;
    }

    /**
     * The farm's ceiling: modules licensed right now (plan §5, active and grace both mean full use).
     *
     * @return list<string>
     */
    public static function activeModuleCodes(string $farmId): array
    {
        return self::central()->table('entitlements')
            ->where('farm_id', $farmId)
            ->whereIn('status', ['active', 'grace'])
            ->pluck('module_code')
            ->all();
    }

    /** One module's licence status, or null if the farm never had it (plan §5). */
    public static function moduleStatus(string $farmId, string $moduleCode): ?string
    {
        return self::central()->table('entitlements')->where('farm_id', $farmId)->where('module_code', $moduleCode)->value('status');
    }

    /**
     * The farm's one active season, or null. One active per farm is a unique key in the schema, so this
     * is a lookup, not a choice.
     *
     * @return array{id: string, name: string, startsOn: string, endsOn: string}|null
     */
    public static function activeSeason(Connection $db, string $farmId): ?array
    {
        $season = $db->table('seasons')
            ->where('farm_id', $farmId)
            ->where('is_active', true)
            ->first(['id', 'name', 'starts_on', 'ends_on']);

        return $season ? ['id' => $season->id, 'name' => $season->name, 'startsOn' => $season->starts_on, 'endsOn' => $season->ends_on] : null;
    }

    /** Just the id: what rides in the ticket, so an offline phone stamps `season_id` itself. */
    public static function activeSeasonId(Connection $db, string $farmId): ?string
    {
        return self::activeSeason($db, $farmId)['id'] ?? null;
    }

    /**
     * Block id and name, for the field app's `GET /blocks` and the office's `GET /farm`.
     *
     * @return list<array{id: string, name: string}>
     */
    public static function blocks(Connection $db, string $farmId): array
    {
        return $db->table('blocks')->where('farm_id', $farmId)->orderBy('name')->get(['id', 'name'])
            ->map(fn (object $row) => ['id' => $row->id, 'name' => $row->name])
            ->all();
    }

    /**
     * A 404 unless the row is this farm's. Its own database already holds only its rows; this also turns
     * a malformed id into a 404 rather than a database error.
     */
    public static function assertOwns(Connection $db, string $table, string $id, string $farmId): void
    {
        if (! Str::isUuid($id) || ! $db->table($table)->where('id', $id)->where('farm_id', $farmId)->exists()) {
            throw ApiError::notFound();
        }
    }

    /** One audit line. `actorType` is `farm` for the office, `staff` for Plaashek Management (plan §6). */
    public static function audit(Connection $db, string $actor, string $action, string $target, ?string $farmId, string $actorType = 'farm'): void
    {
        $db->table('audit_log')->insert([
            'id' => (string) Str::uuid7(),
            'actor' => $actor,
            'actor_type' => $actorType,
            'action' => $action,
            'target' => $target,
            'farm_id' => $farmId,
        ]);
    }
}
