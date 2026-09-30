<?php

namespace App\Http\Controllers;

use App\Auth\Passwords;
use App\Auth\StaffClaims;
use App\Farm\Farms;
use App\Http\ApiError;
use App\Http\Input;
use Illuminate\Http\Request;

final class AuthController extends Controller
{
    /**
     * Farm office login. The login directory says which farm the email belongs to; the password is
     * checked in that farm's own database.
     *
     * @return array<string, mixed>
     */
    public function login(Request $request): array
    {
        ['email' => $email, 'password' => $password] = Input::parse(['email' => 'email', 'password' => 'string|min:1'], $this->body($request));

        $farmId = Farms::central()->table('login_directory')->where('email', $email)->value('farm_id');
        $membership = null;

        if ($farmId !== null) {
            $membership = $this->farm->use($farmId)->table('farm_memberships')->where('email', $email)->first();
        }

        $passwordOk = Passwords::check($password, $membership?->password_hash);
        if (! $membership?->password_hash || ! $passwordOk) {
            throw ApiError::unauthorized('invalid_credentials', 'Incorrect email or password');
        }

        $claims = new StaffClaims($membership->id, $membership->farm_id, $membership->role);

        return [
            'token' => StaffClaims::sign($claims),
            'farmMembershipId' => $membership->id,
            'farmId' => $membership->farm_id,
            'role' => $membership->role,
            'language' => Farms::language($membership->farm_id),
        ];
    }
}
