<?php

namespace App\Logic;

use Illuminate\Http\Response;

final class Csv
{
    /**
     * With a UTF-8 BOM so Excel (the actual target, plan §10) opens accented names correctly instead of
     * guessing Latin-1.
     *
     * @param  list<string>  $headers
     * @param  iterable<list<mixed>>  $rows
     */
    public static function make(array $headers, iterable $rows): string
    {
        $lines = [implode(',', array_map(self::cell(...), $headers))];
        foreach ($rows as $row) {
            $lines[] = implode(',', array_map(self::cell(...), $row));
        }

        return "\u{FEFF}".implode("\r\n", $lines)."\r\n";
    }

    public static function download(string $filename, string $csv): Response
    {
        return new Response($csv, 200, [
            'content-type' => 'text/csv; charset=utf-8',
            'content-disposition' => "attachment; filename=\"{$filename}\"",
        ]);
    }

    /**
     * Reads a CSV the office exported from somewhere else: a BOM, quoted cells with commas or quotes,
     * CRLF. Rows are keyed by header, lower-cased with spaces and hyphens as underscores, so
     * `Worker Number` and `worker_number` arrive as one thing.
     *
     * @return list<array<string, string>>
     */
    public static function parse(string $text): array
    {
        $rows = [];
        $row = [];
        $cell = '';
        $quoted = false;

        $body = (string) preg_replace('/^\x{FEFF}/u', '', $text);
        $chars = mb_str_split($body);
        $count = count($chars);

        for ($i = 0; $i < $count; $i++) {
            $char = $chars[$i];

            if ($quoted) {
                if ($char !== '"') {
                    $cell .= $char;
                } elseif (($chars[$i + 1] ?? null) === '"') {
                    $cell .= '"';
                    $i++;
                } else {
                    $quoted = false;
                }

                continue;
            }

            if ($char === '"') {
                $quoted = true;
            } elseif ($char === ',') {
                $row[] = $cell;
                $cell = '';
            } elseif ($char === "\n" || $char === "\r") {
                // A CRLF is one break, not two empty rows.
                if ($char === "\r" && ($chars[$i + 1] ?? null) === "\n") {
                    $i++;
                }
                $row[] = $cell;
                $cell = '';
                if (self::hasValue($row)) {
                    $rows[] = $row;
                }
                $row = [];
            } else {
                $cell .= $char;
            }
        }

        $row[] = $cell;
        if (self::hasValue($row)) {
            $rows[] = $row;
        }

        $headers = array_shift($rows);
        if ($headers === null) {
            return [];
        }

        $keys = array_map(fn (string $h) => (string) preg_replace('/[\s-]+/u', '_', mb_strtolower(trim($h))), $headers);

        return array_map(function (array $values) use ($keys) {
            $out = [];
            foreach ($keys as $index => $key) {
                $out[$key] = trim($values[$index] ?? '');
            }

            return $out;
        }, $rows);
    }

    private static function cell(mixed $value): string
    {
        if ($value === null) {
            return '';
        }

        $cell = is_float($value) || is_int($value) ? Numbers::js($value) : (is_bool($value) ? ($value ? 'true' : 'false') : (string) $value);

        return preg_match('/[",\r\n]/', $cell) ? '"'.str_replace('"', '""', $cell).'"' : $cell;
    }

    /**
     * @param  list<string>  $row
     */
    private static function hasValue(array $row): bool
    {
        foreach ($row as $value) {
            if (trim($value) !== '') {
                return true;
            }
        }

        return false;
    }
}
