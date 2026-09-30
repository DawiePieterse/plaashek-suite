<?php

namespace App\Support;

use Illuminate\Database\Connection;

final class Sql
{
    /**
     * Inserts a row unless one with the same unique key is already there: a phone retrying an upload whose
     * answer it never got must not double the capture.
     *
     * Not `INSERT IGNORE`, which would also swallow a foreign key that points nowhere; only a duplicate
     * key is let through, as Postgres's `ON CONFLICT DO NOTHING` did.
     *
     * @param  array<string, mixed>  $row
     */
    public static function insertIfAbsent(Connection $db, string $table, array $row): void
    {
        ksort($row);
        $query = $db->table($table);

        $db->insert(
            $query->getGrammar()->compileInsert($query, [$row]).' on duplicate key update `id` = `id`',
            array_values($row),
        );
    }
}
