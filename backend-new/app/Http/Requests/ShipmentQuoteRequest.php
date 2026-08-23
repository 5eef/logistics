<?php

namespace App\Http\Requests;

use Illuminate\Foundation\Http\FormRequest;
use Illuminate\Validation\Rule;

class ShipmentQuoteRequest extends FormRequest
{
    public function authorize(): bool
    {
        return true;
    }

    public function rules(): array
    {
        $cities = config('logistics.cities');

        return [
            'from_city' => ['required', Rule::in($cities)],
            'to_city' => ['required', Rule::in($cities)],
            'weight' => ['required', 'regex:/^\d{1,4}(?:\.\d{1,3})?$/', 'numeric', 'gt:0', 'max:1000'],
        ];
    }
}
