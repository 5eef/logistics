<?php

namespace App\Http\Requests;

use App\Services\PhoneNormalizer;
use Illuminate\Foundation\Http\FormRequest;
use Illuminate\Validation\Rule;

class CreateShipmentRequest extends FormRequest
{
    public function authorize(): bool
    {
        return in_array($this->user()?->role, ['expediteur', 'admin'], true);
    }

    protected function prepareForValidation(): void
    {
        $this->merge(['recipient_phone' => PhoneNormalizer::normalize($this->input('recipient_phone'))]);
    }

    public function rules(): array
    {
        $cities = config('logistics.cities');

        return [
            'client_request_id' => ['nullable', 'uuid'],
            'from_address' => ['required', 'string', 'max:500'],
            'to_address' => ['required', 'string', 'max:500'],
            'from_city' => ['required', Rule::in($cities)],
            'to_city' => ['required', Rule::in($cities)],
            'recipient_name' => ['required', 'string', 'max:120'],
            'recipient_phone' => ['required', 'string', 'max:20', 'regex:/^\+212[5-8][0-9]{8}$/'],
            'weight' => ['required', 'regex:/^\d{1,4}(?:\.\d{1,3})?$/', 'numeric', 'gt:0', 'max:1000'],
            'description' => ['nullable', 'string', 'max:5000'],
            'notes' => ['nullable', 'string', 'max:5000'],
            'is_voyageur_eligible' => ['sometimes', 'boolean'],
            'price' => ['prohibited'],
        ];
    }
}
