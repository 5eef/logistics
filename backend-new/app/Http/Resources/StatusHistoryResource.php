<?php

namespace App\Http\Resources;

use App\Models\StatusHistory;
use Illuminate\Http\Request;
use Illuminate\Http\Resources\Json\JsonResource;

/** @mixin StatusHistory */
class StatusHistoryResource extends JsonResource
{
    public function toArray(Request $request): array
    {
        return [
            'status' => $this->status,
            'message' => $this->message,
            'city' => $this->city,
            'created_at' => $this->created_at,
        ];
    }
}
