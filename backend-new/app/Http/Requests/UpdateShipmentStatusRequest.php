<?php

namespace App\Http\Requests;

use Illuminate\Foundation\Http\FormRequest;
use Illuminate\Validation\Rule;

class UpdateShipmentStatusRequest extends FormRequest
{
    public function authorize(): bool
    {
        return $this->user() !== null;
    }

    public function rules(): array
    {
        return [
            'status' => ['required', Rule::in(['picked_up', 'in_transit', 'out_for_delivery', 'delivered', 'failed', 'returned'])],
            'message' => ['nullable', 'string', 'max:500'],
            'trip_id' => ['nullable', 'integer', 'exists:traveler_trips,id'],
        ];
    }
}
