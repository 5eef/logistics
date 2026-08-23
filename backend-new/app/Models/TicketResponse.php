<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;

class TicketResponse extends Model
{
    protected $fillable = ['ticket_id', 'user_id', 'user_name', 'message'];
}
