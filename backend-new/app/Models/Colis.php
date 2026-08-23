<?php

namespace App\Models;

use App\Services\PhoneNormalizer;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\Relations\HasMany;

class Colis extends Model
{
    protected $hidden = ['pin_code'];

    protected $fillable = [
        'tracking_id', 'client_request_id', 'expediteur_id', 'destinataire_id', 'livreur_id', 'voyageur_id',
        'status', 'from_city', 'to_city', 'from_address', 'to_address',
        'recipient_name', 'recipient_phone', 'weight', 'description', 'price',
        'is_paid', 'payment_status', 'payment_method', 'paid_at', 'pin_code', 'pin_validated',
        'pin_attempts', 'pin_locked_until', 'qr_code', 'notes', 'estimated_delivery',
        'delivered_at', 'is_voyageur_eligible',
    ];

    protected $casts = [
        'price' => 'decimal:2',
        'is_paid' => 'boolean',
        'paid_at' => 'datetime',
        'pin_validated' => 'boolean',
        'pin_locked_until' => 'datetime',
        'estimated_delivery' => 'datetime',
        'delivered_at' => 'datetime',
        'is_voyageur_eligible' => 'boolean',
    ];

    public function setRecipientPhoneAttribute(?string $value): void
    {
        $this->attributes['recipient_phone'] = PhoneNormalizer::normalize($value);
    }

    public function expediteur(): BelongsTo
    {
        return $this->belongsTo(User::class, 'expediteur_id');
    }

    public function livreur(): BelongsTo
    {
        return $this->belongsTo(User::class, 'livreur_id');
    }

    public function voyageur(): BelongsTo
    {
        return $this->belongsTo(User::class, 'voyageur_id');
    }

    public function destinataire(): BelongsTo
    {
        return $this->belongsTo(User::class, 'destinataire_id');
    }

    /** @return HasMany<StatusHistory, $this> */
    public function statusHistory(): HasMany
    {
        return $this->hasMany(StatusHistory::class);
    }
}
