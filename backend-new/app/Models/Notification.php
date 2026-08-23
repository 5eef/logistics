<?php

namespace App\Models;

use App\Events\NotificationCreated;
use Illuminate\Database\Eloquent\Model;

class Notification extends Model
{
    protected $fillable = ['user_id', 'title', 'message', 'type', 'is_read'];

    protected $casts = ['is_read' => 'boolean'];

    protected static function booted(): void
    {
        static::created(fn (Notification $notification) => NotificationCreated::dispatch($notification));
    }
}
