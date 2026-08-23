<?php

namespace App\Http\Resources;

use App\Models\User;
use Illuminate\Http\Request;

/** @mixin User */
class AdminUserResource extends UserResource
{
    public function toArray(Request $request): array
    {
        return array_merge(parent::toArray($request), [
            'cin' => $this->cin,
            'license_number' => $this->license_number,
            'verified_at' => $this->verified_at,
            'verified_by' => $this->verified_by,
            'verification_reason' => $this->verification_reason,
        ]);
    }
}
