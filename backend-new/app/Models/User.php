<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Foundation\Auth\User as Authenticatable;
use Laravel\Sanctum\HasApiTokens;

class User extends Authenticatable
{
    use HasApiTokens, HasFactory;

    protected $fillable = [
        'name', 'email', 'phone', 'password', 'role', 'city',
        'avatar_path',
        'cin', 'license_number', 'vehicle_type', 'vehicle_plate',
        'rating', 'rating_count', 'is_online', 'is_verified',
        'verification_status', 'warnings', 'suspended_until', 'is_banned',
    ];

    protected $hidden = ['password', 'remember_token', 'avatar_path'];

    protected $casts = [
        'is_online' => 'boolean',
        'is_verified' => 'boolean',
        'is_banned' => 'boolean',
        'rating' => 'float',
        'suspended_until' => 'datetime',
    ];

    protected $appends = ['avatar_url'];

    public function getAvatarUrlAttribute(): ?string
    {
        return $this->avatar_path
            ? url('/api/profile/avatar/'.basename($this->avatar_path))
            : null;
    }
}
