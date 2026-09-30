<?php

namespace App\Farm;

use App\Http\ApiError;
use Illuminate\Database\Connection;
use Illuminate\Database\DatabaseManager;
use Illuminate\Support\Facades\Crypt;
use Illuminate\Support\Str;
use LogicException;

/**
 * Which farm's database this request works in (ADR 0015).
 *
 * Each request names its farm once, from whatever it authenticated with: a staff session, a device
 * ticket, the slug in a pairing token, the login directory. From then on every farm query goes through
 * `db()`, which is that farm's own database, reached with that farm's own database user. A query that
 * forgets a `farm_id` filter can only ever see the farm it is already in.
 *
 * Each farm gets its own named connection (`farm_<slug>`), so nothing opened for one farm is reused for
 * another, and `forget()` clears the choice when the request ends.
 */
final class FarmDatabase
{
    private ?object $farm = null;

    public function __construct(private readonly DatabaseManager $databases) {}

    /** Switches this request to the farm's database. A farm that does not exist is a 404. */
    public function use(string $farmId): Connection
    {
        $farm = Str::isUuid($farmId) ? $this->databases->connection('central')->table('farms')->where('id', $farmId)->first() : null;
        if (! $farm) {
            throw ApiError::notFound();
        }

        return $this->useRow($farm);
    }

    /** As `use()`, by the slug a pairing token starts with. */
    public function useSlug(string $slug): Connection
    {
        $farm = $this->databases->connection('central')->table('farms')->where('slug', $slug)->first();
        if (! $farm) {
            throw ApiError::notFound();
        }

        return $this->useRow($farm);
    }

    public function useRow(object $farm): Connection
    {
        $this->farm = $farm;

        return $this->db();
    }

    /** The current farm's database. Asking before a farm is chosen is a programming error. */
    public function db(): Connection
    {
        if (! $this->farm) {
            throw new LogicException('No farm chosen for this request');
        }

        return $this->connect($this->farm);
    }

    public function farmId(): string
    {
        if (! $this->farm) {
            throw new LogicException('No farm chosen for this request');
        }

        return $this->farm->id;
    }

    public function slug(): string
    {
        if (! $this->farm) {
            throw new LogicException('No farm chosen for this request');
        }

        return $this->farm->slug;
    }

    public function forget(): void
    {
        $this->farm = null;
    }

    /** A connection to a farm's database from its `farms` row, registered the first time it is needed. */
    public function connect(object $farm): Connection
    {
        $name = self::connectionName($farm->slug);

        if (! config()->has("database.connections.{$name}")) {
            config(["database.connections.{$name}" => array_merge(config('database.connections.farm_template'), [
                'database' => $farm->db_database,
                'username' => $farm->db_username,
                'password' => Crypt::decryptString($farm->db_password),
            ])]);
        }

        return $this->databases->connection($name);
    }

    public static function connectionName(string $slug): string
    {
        return "farm_{$slug}";
    }
}
