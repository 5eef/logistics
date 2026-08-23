<?php

namespace App\Models;

use App\Services\PhoneNormalizer;
use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Relations\HasMany;
use Illuminate\Foundation\Auth\User as Authenticatable;
use Illuminate\Notifications\Notifiable;
use Laravel\Sanctum\HasApiTokens;

class User extends Authenticatable
{
    use HasApiTokens, HasFactory, Notifiable;

    protected $fillable = [
        'name', 'email', 'phone', 'password', 'role', 'city',
        'phone_verified_at',
        'avatar_path',
        'cin', 'license_number', 'vehicle_type', 'vehicle_plate',
        'rating', 'rating_count', 'is_online', 'is_verified',
        'verification_status', 'verified_at', 'verified_by', 'verification_reason',
        'warnings', 'suspended_until', 'is_banned',
    ];

    protected $hidden = ['password', 'remember_token', 'avatar_path'];

    protected $casts = [
        'is_online' => 'boolean',
        'is_verified' => 'boolean',
        'is_banned' => 'boolean',
        'rating' => 'float',
        'phone_verified_at' => 'datetime',
        'verified_at' => 'datetime',
        'suspended_until' => 'datetime',
    ];

    public function setPhoneAttribute(?string $value): void
    {
        $this->attributes['phone'] = PhoneNormalizer::normalize($value);
    }

    public function travelerTrips(): HasMany
    {
        return $this->hasMany(TravelerTrip::class);
    }

    protected $appends = ['avatar_url'];

    public function getAvatarUrlAttribute(): ?string
    {
        return $this->avatar_path
            ? url('/api/profile/avatar/'.basename($this->avatar_path))
            : null;
    }
}
