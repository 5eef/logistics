<?php

namespace App\Services;

use Illuminate\Validation\ValidationException;

final class ShipmentStateMachine
{
    private const CARRIER_TRANSITIONS = [
        'pending' => ['picked_up'],
        'picked_up' => ['in_transit', 'out_for_delivery', 'failed'],
        'in_transit' => ['out_for_delivery', 'failed'],
        'out_for_delivery' => ['failed'],
        'failed' => ['returned'],
    ];

    public function assertCarrierTransition(string $from, string $to): void
    {
        if ($to === 'delivered') {
            throw ValidationException::withMessages([
                'status' => 'La livraison finale nécessite la validation du PIN.',
            ]);
        }

        if (! in_array($to, self::CARRIER_TRANSITIONS[$from] ?? [], true)) {
            throw ValidationException::withMessages(['status' => 'Transition de statut invalide.']);
        }
    }
}
