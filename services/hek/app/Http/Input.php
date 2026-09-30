<?php

namespace App\Http;

use DateTimeImmutable;

/**
 * Checks a request body or query against a shape and returns only the fields the shape names, the way
 * the zod schemas it replaces did: types are strict (a number is not a numeric string), unknown keys are
 * dropped, and any failure is a 400 `validation_error`.
 *
 * A shape maps each field to rules separated by `|`:
 *
 * - `optional` the key may be absent (and is then absent from the result); `nullable` null is allowed;
 *   `default:x` fills an absent key
 * - types: `string`, `number` (int or float), `int`, `boolean`, `uuid`, `email`, `date` (YYYY-MM-DD),
 *   `datetime` (ISO 8601 with Z or an offset), `null` (only null), `in:a,b`, `coerce_number` (a query
 *   string number)
 * - `trim` (strings, before length checks), `min:n` / `max:n` (string length, or a number's value),
 *   `positive`
 */
final class Input
{
    private const UUID = '/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i';

    private const DATETIME = '/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d+)?(Z|[+-]\d{2}(:?\d{2})?)$/';

    /**
     * @param  array<string, string>  $shape
     * @return array<string, mixed>
     */
    public static function parse(array $shape, mixed $input, string $path = ''): array
    {
        if (! is_array($input) || ($input !== [] && array_is_list($input))) {
            throw ApiError::validation(($path === '' ? 'body' : $path).': Expected object');
        }

        $out = [];

        foreach ($shape as $key => $spec) {
            $rules = self::rules($spec);
            $field = $path === '' ? $key : "{$path}.{$key}";

            if (! array_key_exists($key, $input)) {
                if (array_key_exists('default', $rules)) {
                    $out[$key] = $rules['default'];
                } elseif (! array_key_exists('optional', $rules)) {
                    throw ApiError::validation("{$field}: Required");
                }

                continue;
            }

            $out[$key] = self::value($input[$key], $rules, $field);
        }

        return $out;
    }

    /**
     * One value against its rules.
     *
     * @param  array<string, string|null>  $rules
     */
    public static function value(mixed $value, array $rules, string $field): mixed
    {
        if ($value === null) {
            if (array_key_exists('nullable', $rules) || array_key_exists('null', $rules)) {
                return null;
            }

            throw ApiError::validation("{$field}: Expected a value, received null");
        }

        if (array_key_exists('null', $rules)) {
            throw ApiError::validation("{$field}: Expected null");
        }

        $fail = fn (string $why) => throw ApiError::validation("{$field}: {$why}");

        if (array_key_exists('coerce_number', $rules)) {
            if (! is_numeric($value)) {
                $fail('Expected number');
            }
            $value = $value + 0;
        }

        $numeric = false;

        if (array_key_exists('string', $rules) || array_key_exists('uuid', $rules) || array_key_exists('email', $rules)
            || array_key_exists('date', $rules) || array_key_exists('datetime', $rules) || array_key_exists('in', $rules)) {
            if (! is_string($value)) {
                $fail('Expected string');
            }
            if (array_key_exists('trim', $rules)) {
                $value = trim($value);
            }
            if (array_key_exists('uuid', $rules) && ! preg_match(self::UUID, $value)) {
                $fail('Invalid uuid');
            }
            if (array_key_exists('email', $rules) && filter_var($value, FILTER_VALIDATE_EMAIL) === false) {
                $fail('Invalid email');
            }
            if (array_key_exists('date', $rules) && ! self::isDate($value)) {
                $fail('Invalid date');
            }
            if (array_key_exists('datetime', $rules) && ! preg_match(self::DATETIME, $value)) {
                $fail('Invalid datetime');
            }
            if (array_key_exists('in', $rules) && ! in_array($value, explode(',', (string) $rules['in']), true)) {
                $fail('Invalid enum value. Expected '.str_replace(',', ' | ', (string) $rules['in']));
            }
        } elseif (array_key_exists('number', $rules) || array_key_exists('int', $rules) || array_key_exists('coerce_number', $rules)) {
            if (! is_int($value) && ! is_float($value)) {
                $fail('Expected number');
            }
            if (is_float($value) && ! is_finite($value)) {
                $fail('Expected finite number');
            }
            if (array_key_exists('int', $rules)) {
                if (is_float($value) && floor($value) !== $value) {
                    $fail('Expected integer');
                }
                $value = (int) $value;
            }
            if (array_key_exists('positive', $rules) && $value <= 0) {
                $fail('Number must be greater than 0');
            }
            $numeric = true;
        } elseif (array_key_exists('boolean', $rules)) {
            if (! is_bool($value)) {
                $fail('Expected boolean');
            }
        }

        if (array_key_exists('min', $rules)) {
            $min = (float) $rules['min'];
            if ($numeric ? $value < $min : mb_strlen((string) $value) < $min) {
                $fail($numeric ? "Number must be greater than or equal to {$rules['min']}" : "String must contain at least {$rules['min']} character(s)");
            }
        }

        if (array_key_exists('max', $rules)) {
            $max = (float) $rules['max'];
            if ($numeric ? $value > $max : mb_strlen((string) $value) > $max) {
                $fail($numeric ? "Number must be less than or equal to {$rules['max']}" : "String must contain at most {$rules['max']} character(s)");
            }
        }

        return $value;
    }

    /**
     * `"optional|string|min:1"` as `['optional' => null, 'string' => null, 'min' => '1']`.
     *
     * @return array<string, string|null>
     */
    public static function rules(string $spec): array
    {
        $rules = [];

        foreach (explode('|', $spec) as $rule) {
            [$name, $argument] = array_pad(explode(':', $rule, 2), 2, null);
            $rules[$name] = $argument;
        }

        return $rules;
    }

    private static function isDate(string $value): bool
    {
        if (! preg_match('/^\d{4}-\d{2}-\d{2}$/', $value)) {
            return false;
        }

        $date = DateTimeImmutable::createFromFormat('!Y-m-d', $value);

        return $date !== false && $date->format('Y-m-d') === $value;
    }
}
