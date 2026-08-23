<?php

namespace App\Policies;

use App\Models\Colis;
use App\Models\User;

class ColisPolicy
{
    public function view(User $user, Colis $colis): bool
    {
        return $user->role === 'admin'
            || $colis->expediteur_id === $user->id
            || $colis->destinataire_id === $user->id
            || $colis->livreur_id === $user->id
            || $colis->voyageur_id === $user->id;
    }

    public function updateStatus(User $user, Colis $colis): bool
    {
        return in_array($user->role, ['livreur', 'voyageur'], true)
            && ($colis->livreur_id === $user->id || $colis->voyageur_id === $user->id);
    }

    public function validatePin(User $user, Colis $colis): bool
    {
        return $this->updateStatus($user, $colis);
    }

    public function rate(User $user, Colis $colis): bool
    {
        return $colis->destinataire_id === $user->id && $colis->status === 'delivered';
    }
}
