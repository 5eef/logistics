<?php

namespace App\Http\Resources;

use App\Models\Colis;
use Illuminate\Http\Request;
use Illuminate\Http\Resources\Json\JsonResource;

/** @mixin Colis */
class ShipmentResource extends JsonResource
{
    public function toArray(Request $request): array
    {
        $user = $request->user();
        $isAvailability = in_array($user?->role, ['livreur', 'voyageur'], true)
            && ($request->input('status') === 'available' || $request->filled('trip_id'));

        return [
            'id' => $this->id,
            'tracking_id' => $this->tracking_id,
            'status' => $this->status,
            'from_city' => $this->from_city,
            'to_city' => $this->to_city,
            'from_address' => $this->when(! $isAvailability, $this->from_address),
            'to_address' => $this->when(! $isAvailability, $this->to_address),
            'recipient_name' => $this->when(! $isAvailability, $this->recipient_name),
            'recipient_phone' => $this->when(! $isAvailability, $this->recipient_phone),
            'weight' => $this->weight,
            'description' => $this->description,
            'price' => $this->price,
            'is_paid' => $this->is_paid,
            'payment_status' => $this->payment_status,
            'payment_method' => $this->payment_method,
            'paid_at' => $this->paid_at,
            'pin_validated' => $this->pin_validated,
            'estimated_delivery' => $this->estimated_delivery,
            'delivered_at' => $this->delivered_at,
            'is_voyageur_eligible' => $this->is_voyageur_eligible,
            'livreur_id' => $this->livreur_id,
            'voyageur_id' => $this->voyageur_id,
            'livreur' => $this->whenLoaded('livreur', fn () => $this->livreur ? new CourierPublicResource($this->livreur) : null),
            'voyageur' => $this->whenLoaded('voyageur', fn () => $this->voyageur ? new CourierPublicResource($this->voyageur) : null),
            'status_history' => StatusHistoryResource::collection($this->whenLoaded('statusHistory')),
            'created_at' => $this->created_at,
            'updated_at' => $this->updated_at,
        ];
    }
}
