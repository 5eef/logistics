<?php

namespace App\Http\Resources;

use App\Models\Colis;
use App\Models\StatusHistory;
use Illuminate\Http\Request;
use Illuminate\Http\Resources\Json\JsonResource;

/** @mixin Colis */
class PublicTrackingResource extends JsonResource
{
    private const PUBLIC_STATUS_MESSAGES = [
        'created' => 'ExpÃ©dition crÃ©Ã©e.',
        'pending' => 'En attente de prise en charge.',
        'picked_up' => 'Colis pris en charge.',
        'in_transit' => 'Colis en transit.',
        'out_for_delivery' => 'Livraison en cours.',
        'delivered' => 'Colis livrÃ©.',
        'failed' => 'La livraison nâ€™a pas pu Ãªtre effectuÃ©e.',
        'returned' => 'Colis retournÃ©.',
    ];

    public function toArray(Request $request): array
    {
        return [
            'tracking_id' => $this->tracking_id,
            'status' => $this->status,
            'from_city' => $this->from_city,
            'to_city' => $this->to_city,
            'estimated_delivery' => $this->estimated_delivery,
            'delivered_at' => $this->delivered_at,
            'created_at' => $this->created_at,
            'updated_at' => $this->updated_at,
            'status_history' => $this->whenLoaded('statusHistory', fn () => $this->statusHistory->map(fn (StatusHistory $item) => [
                'status' => $item->status,
                'message' => self::PUBLIC_STATUS_MESSAGES[$item->status] ?? 'Statut mis Ã  jour.',
                'city' => $item->city,
                'created_at' => $item->created_at,
            ])->values()->all()),
            'livreur' => $this->whenLoaded('livreur', fn () => $this->livreur ? new CourierPublicResource($this->livreur) : null),
            'voyageur' => $this->whenLoaded('voyageur', fn () => $this->voyageur ? new CourierPublicResource($this->voyageur) : null),
        ];
    }
}
