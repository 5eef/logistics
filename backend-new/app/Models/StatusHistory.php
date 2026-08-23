<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

class StatusHistory extends Model
{
    protected $fillable = ['colis_id', 'status', 'message', 'city', 'updated_by'];

    public function colis(): BelongsTo
    {
        return $this->belongsTo(Colis::class);
    }
}
