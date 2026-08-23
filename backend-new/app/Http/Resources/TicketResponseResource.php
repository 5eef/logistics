<?php

namespace App\Http\Resources;

use App\Models\TicketResponse;
use Illuminate\Http\Request;
use Illuminate\Http\Resources\Json\JsonResource;

/** @mixin TicketResponse */
class TicketResponseResource extends JsonResource
{
    public function toArray(Request $request): array
    {
        return [
            'id' => $this->id,
            'user_name' => $this->user_name,
            'message' => $this->message,
            'created_at' => $this->created_at,
        ];
    }
}
