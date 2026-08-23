<?php

namespace App\Services;

use App\Models\Colis;
use App\Models\Notification;
use App\Models\TravelerTrip;
use App\Models\User;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Gate;
use Illuminate\Support\Facades\Hash;
use Illuminate\Support\Facades\Log;
use Illuminate\Validation\ValidationException;

final class DeliveryService
{
    public function __construct(private ShipmentStateMachine $stateMachine) {}

    public function updateStatus(
        User $user,
        int $shipmentId,
        string $status,
        ?string $message = null,
        ?int $tripId = null,
    ): Colis {
        return DB::transaction(function () use ($user, $shipmentId, $status, $message, $tripId) {
            $colis = Colis::query()->whereKey($shipmentId)->lockForUpdate()->firstOrFail();

            // Final delivery is exclusively confirmed through the dedicated,
            // rate-limited PIN endpoint, including idempotent retries.
            if ($status === 'delivered') {
                Gate::forUser($user)->authorize('updateStatus', $colis);
                $this->stateMachine->assertCarrierTransition($colis->status, $status);
            }

            if ($colis->status === $status) {
                Gate::forUser($user)->authorize('updateStatus', $colis);

                return $colis;
            }

            if (! in_array($user->role, ['livreur', 'voyageur'], true)) {
                abort(403, 'Le statut transporteur ne peut pas être modifié par ce compte.');
            }

            if ($status === 'picked_up' && ! $colis->livreur_id && ! $colis->voyageur_id) {
                $this->authorizeClaim($user, $colis, $tripId);
                $column = $user->role === 'livreur' ? 'livreur_id' : 'voyageur_id';
                $colis->{$column} = $user->id;
            }

            Gate::forUser($user)->authorize('updateStatus', $colis);
            $this->stateMachine->assertCarrierTransition($colis->status, $status);

            $colis->status = $status;
            $colis->save();
            $colis->statusHistory()->create([
                'status' => $status,
                'message' => $message ?: "Statut mis à jour : {$status}",
                'city' => $user->city,
                'updated_by' => $user->id,
            ]);

            return $colis;
        });
    }

    public function validatePin(User $user, int $shipmentId, string $pin): Colis
    {
        $result = DB::transaction(function () use ($user, $shipmentId, $pin) {
            $colis = Colis::query()->whereKey($shipmentId)->lockForUpdate()->firstOrFail();
            Gate::forUser($user)->authorize('validatePin', $colis);

            if ($colis->pin_validated && $colis->status === 'delivered') {
                return ['colis' => $colis, 'error' => null];
            }

            if ($colis->pin_locked_until?->isFuture()) {
                return ['colis' => $colis, 'error' => 'locked'];
            }

            if ($colis->status !== 'out_for_delivery') {
                return ['colis' => $colis, 'error' => 'state'];
            }

            if (! Hash::check($pin, $colis->pin_code)) {
                $attempts = $colis->pin_attempts + 1;
                $maximum = (int) config('logistics.delivery_pin.maximum_attempts', 5);
                $colis->pin_attempts = $attempts;
                if ($attempts >= $maximum) {
                    $colis->pin_locked_until = now()->addMinutes((int) config('logistics.delivery_pin.lock_minutes', 15));
                }
                $colis->save();
                Log::warning('delivery_pin.failed', [
                    'shipment_id' => $colis->id,
                    'actor_user_id' => $user->id,
                    'attempts' => $attempts,
                    'locked' => $colis->pin_locked_until?->isFuture() ?? false,
                ]);

                return ['colis' => $colis, 'error' => 'invalid'];
            }

            $colis->forceFill([
                'pin_validated' => true,
                'pin_attempts' => 0,
                'pin_locked_until' => null,
                'status' => 'delivered',
                'delivered_at' => now(),
            ])->save();
            $colis->statusHistory()->create([
                'status' => 'delivered',
                'message' => 'Livraison confirmée par PIN',
                'city' => $user->city,
                'updated_by' => $user->id,
            ]);
            Notification::create([
                'user_id' => $colis->expediteur_id,
                'title' => 'Colis livré !',
                'message' => "Votre colis {$colis->tracking_id} a été livré avec succès.",
                'type' => 'success',
            ]);

            return ['colis' => $colis, 'error' => null];
        });

        match ($result['error']) {
            'locked' => abort(429, 'Trop de tentatives. Réessayez plus tard.'),
            'state' => throw ValidationException::withMessages(['pin' => 'Le colis doit être en cours de livraison finale.']),
            'invalid' => throw ValidationException::withMessages(['pin' => 'Code PIN incorrect.']),
            default => null,
        };

        return $result['colis'];
    }

    private function authorizeClaim(User $user, Colis $colis, ?int $tripId): void
    {
        if (! $user->is_verified || $user->verification_status !== 'approved') {
            abort(403, 'Compte transporteur non vérifié.');
        }
        if ($colis->status !== 'pending' || $colis->livreur_id || $colis->voyageur_id) {
            abort(409, 'Ce colis n’est plus disponible.');
        }
        if ($user->role === 'livreur') {
            if (! $user->is_online || ! in_array($user->city, [$colis->from_city, $colis->to_city], true)) {
                abort(403, 'Ce colis n’est pas disponible pour ce livreur.');
            }

            return;
        }
        if (! $colis->is_voyageur_eligible) {
            abort(403, 'Colis non éligible aux voyageurs.');
        }

        $trip = TravelerTrip::query()
            ->whereKey($tripId)
            ->where('user_id', $user->id)
            ->where('status', 'active')
            ->whereDate('departure_date', '>=', today())
            ->where('from_city', $colis->from_city)
            ->where('to_city', $colis->to_city)
            ->first();
        if (! $trip) {
            abort(403, 'Un voyage actif correspondant est requis.');
        }
    }
}
