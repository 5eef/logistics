<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

class TravelerTrip extends Model
{
    protected $fillable = ['user_id', 'from_city', 'to_city', 'departure_date', 'status'];

    protected $casts = ['departure_date' => 'date'];

    public function user(): BelongsTo
    {
        return $this->belongsTo(User::class);
    }
}
