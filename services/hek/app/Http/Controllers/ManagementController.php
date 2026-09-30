<?php

namespace App\Http\Controllers;

use App\Auth\ManagementClaims;
use App\Auth\Passwords;
use App\Farm\FarmDatabase;
use App\Farm\FarmProvisioner;
use App\Farm\Farms;
use App\Http\ApiError;
use App\Http\Input;
use App\Support\Rows;
use Illuminate\Http\Request;
use Illuminate\Support\Str;

/** Plaashek Management: cross-farm, staff only (plan §4.1). Farms have no write path into this layer. */
final class ManagementController extends Controller
{
    public function __construct(FarmDatabase $farm, private readonly FarmProvisioner $provisioner)
    {
        parent::__construct($farm);
    }

    /**
     * @return array<string, mixed>
     */
    public function login(Request $request): array
    {
        ['email' => $email, 'password' => $password] = Input::parse(['email' => 'email', 'password' => 'string|min:1'], $this->body($request));

        $staff = Farms::central()->table('plaashek_staff')->where('email', $email)->first();

        $passwordOk = Passwords::check($password, $staff?->password_hash);
        if (! $staff || ! $passwordOk) {
            throw ApiError::unauthorized('invalid_credentials', 'Incorrect email or password');
        }

        return [
            'token' => ManagementClaims::sign(new ManagementClaims($staff->id, $staff->email)),
            'staffId' => $staff->id,
            'email' => $staff->email,
        ];
    }

    /**
     * @return array<string, mixed>
     */
    public function farms(): array
    {
        $central = Farms::central();

        $rows = $central->table('farms')
            ->join('organisations', 'organisations.id', '=', 'farms.organisation_id')
            ->orderBy('farms.name')
            ->get(['farms.id', 'farms.name', 'farms.language', 'organisations.id as organisation_id', 'organisations.name as organisation_name']);

        $entitlements = [];
        foreach ($central->table('entitlements')->get(['farm_id', 'module_code', 'status']) as $e) {
            $entitlements[$e->farm_id][] = ['moduleCode' => $e->module_code, 'status' => $e->status];
        }

        return ['farms' => $rows->map(fn (object $row) => [
            'farm' => ['id' => $row->id, 'name' => $row->name, 'language' => $row->language],
            'organisation' => ['id' => $row->organisation_id, 'name' => $row->organisation_name],
            'entitlements' => $entitlements[$row->id] ?? [],
        ])->all()];
    }

    /**
     * A new organisation and farm. On cPanel the farm's database is made first in the Database Wizard and
     * handed over here; with FARM_DB_AUTO_CREATE the API makes it.
     *
     * @return array<string, mixed>
     */
    public function createFarm(Request $request): array
    {
        $body = Input::parse([
            'organisationName' => 'string|min:1',
            'farmName' => 'string|min:1',
            'language' => 'in:af,en|default:af',
            'database' => 'optional|nullable',
        ], $this->body($request));

        $database = $body['database'] ?? null;
        if ($database !== null) {
            $database = Input::parse([
                'name' => 'string|trim|min:1|max:64',
                'username' => 'string|trim|min:1|max:64',
                'password' => 'string|min:1',
            ], $database, 'database');
        }

        return $this->provisioner->create($body['organisationName'], $body['farmName'], $body['language'], $database, $this->management($request)->staffId);
    }

    /**
     * @return array<string, mixed>
     */
    public function setEntitlement(Request $request, string $farmId): array
    {
        $staff = $this->management($request);
        $body = Input::parse([
            'moduleCode' => 'string|min:1',
            'status' => 'in:active,grace,suspended,cancelled',
        ], $this->body($request));

        $central = Farms::central();
        if (! Str::isUuid($farmId) || ! $central->table('farms')->where('id', $farmId)->exists()) {
            throw ApiError::notFound();
        }

        return $central->transaction(function () use ($central, $farmId, $body, $staff) {
            $central->table('entitlements')->upsert(
                [['id' => (string) Str::uuid7(), 'farm_id' => $farmId, 'module_code' => $body['moduleCode'], 'status' => $body['status']]],
                ['farm_id', 'module_code'],
                ['status'],
            );

            Farms::audit($central, $staff->staffId, 'set_entitlement', "{$farmId}:{$body['moduleCode']}", $farmId, 'staff');

            $entitlement = $central->table('entitlements')->where('farm_id', $farmId)->where('module_code', $body['moduleCode'])->first();

            return ['entitlement' => Rows::one($entitlement)];
        });
    }

    /**
     * The farm's first office login: nothing else can create one (plan §3.1). The person and login go in
     * the farm's own database; the email goes in the directory so a login can find the farm.
     *
     * @return array<string, mixed>
     */
    public function createLogin(Request $request, string $farmId): array
    {
        $staff = $this->management($request);
        $body = Input::parse([
            'personName' => 'string|min:1',
            'email' => 'email',
            'password' => 'string|min:8',
            'role' => 'in:admin,owner',
        ], $this->body($request));

        $central = Farms::central();
        if ($central->table('login_directory')->where('email', $body['email'])->exists()) {
            throw ApiError::conflict('email_taken', 'This email already has a login');
        }

        $db = $this->farm->use($farmId);

        $result = $db->transaction(function () use ($db, $farmId, $body) {
            $person = ['id' => (string) Str::uuid7(), 'farm_id' => $farmId, 'name' => $body['personName']];
            $db->table('people')->insert($person);

            $membershipId = (string) Str::uuid7();
            $db->table('farm_memberships')->insert([
                'id' => $membershipId,
                'farm_id' => $farmId,
                'person_id' => $person['id'],
                'email' => $body['email'],
                'password_hash' => Passwords::hash($body['password']),
                'role' => $body['role'],
            ]);

            return [
                'person' => Rows::one($db->table('people')->where('id', $person['id'])->first()),
                'membership' => ['id' => $membershipId, 'email' => $body['email'], 'role' => $body['role']],
            ];
        });

        // After the farm's own row: a directory entry never points at a login that is not there.
        $central->transaction(function () use ($central, $farmId, $body, $staff, $result) {
            $central->table('login_directory')->insert(['email' => $body['email'], 'farm_id' => $farmId]);
            Farms::audit($central, $staff->staffId, 'create_farm_login', $result['membership']['id'], $farmId, 'staff');
        });

        return $result;
    }
}
