<?php

namespace App\Http\Resources;

use App\Models\User;
use Illuminate\Http\Request;
use Illuminate\Http\Resources\Json\JsonResource;

/** @mixin User */
class UserResource extends JsonResource
{
    public function toArray(Request $request): array
    {
        return [
            'id' => $this->id,
            'name' => $this->name,
            'email' => $this->email,
            'phone' => $this->phone,
            'phone_verified_at' => $this->phone_verified_at,
            'role' => $this->role,
            'city' => $this->city,
            'avatar_url' => $this->avatar_url,
            'rating' => $this->rating,
            'rating_count' => $this->rating_count,
            'is_online' => $this->is_online,
            'is_verified' => $this->is_verified,
            'verification_status' => $this->verification_status,
            'vehicle_type' => $this->when(in_array($this->role, ['livreur', 'voyageur'], true), $this->vehicle_type),
            'vehicle_plate' => $this->when(in_array($this->role, ['livreur', 'voyageur'], true), $this->vehicle_plate),
            'warnings' => $this->warnings,
            'suspended_until' => $this->suspended_until,
            'is_banned' => $this->is_banned,
            'created_at' => $this->created_at,
        ];
    }
}
