<?php

namespace App\Policies;

use App\Models\Ticket;
use App\Models\User;

class TicketPolicy
{
    public function view(User $user, Ticket $ticket): bool
    {
        return $user->role === 'admin' || $ticket->user_id === $user->id;
    }

    public function respond(User $user, Ticket $ticket): bool
    {
        return $this->view($user, $ticket);
    }
}
