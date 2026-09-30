<?php

namespace App\Http\Controllers;

use App\Auth\ManagementClaims;
use App\Auth\StaffClaims;
use App\Auth\TicketClaims;
use App\Farm\FarmDatabase;
use Illuminate\Database\Connection;
use Illuminate\Http\Request;

abstract class Controller
{
    public function __construct(protected readonly FarmDatabase $farm) {}

    /** The farm database the request's session or ticket chose. */
    protected function db(): Connection
    {
        return $this->farm->db();
    }

    protected function staff(Request $request): StaffClaims
    {
        return $request->attributes->get('staff');
    }

    protected function device(Request $request): TicketClaims
    {
        return $request->attributes->get('device');
    }

    protected function management(Request $request): ManagementClaims
    {
        return $request->attributes->get('management');
    }

    /**
     * The JSON body, or an empty array when there is none.
     *
     * @return array<mixed>
     */
    protected function body(Request $request): mixed
    {
        return $request->isJson() ? $request->json()->all() : [];
    }
}
