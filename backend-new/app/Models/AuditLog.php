<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;

class AuditLog extends Model
{
    public const UPDATED_AT = null;

    protected $fillable = [
        'actor_user_id', 'action', 'target_type', 'target_id', 'reason', 'old_values', 'new_values',
    ];

    protected $casts = ['old_values' => 'array', 'new_values' => 'array'];
}
