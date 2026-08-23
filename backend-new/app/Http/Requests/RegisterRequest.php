<?php

namespace App\Http\Requests;

use App\Services\PhoneNormalizer;
use Illuminate\Foundation\Http\FormRequest;
use Illuminate\Support\Str;
use Illuminate\Validation\Rule;
use Illuminate\Validation\Rules\Password;

class RegisterRequest extends FormRequest
{
    public function authorize(): bool
    {
        return true;
    }

    protected function prepareForValidation(): void
    {
        $this->merge([
            'email' => Str::lower(trim((string) $this->input('email'))),
            'phone' => PhoneNormalizer::normalize($this->input('phone')),
        ]);
    }

    public function rules(): array
    {
        return [
            'name' => ['required', 'string', 'max:120'],
            'email' => ['required', 'email', 'max:255', 'unique:users,email'],
            'phone' => ['required', 'string', 'max:20', 'regex:/^\+212[5-8][0-9]{8}$/', 'unique:users,phone'],
            'password' => ['required', 'string', 'max:72', Password::min(10)->letters()->numbers()],
            'role' => ['required', Rule::in(['expediteur', 'livreur', 'destinataire', 'voyageur'])],
            'city' => ['required', Rule::in(config('logistics.cities'))],
            'cin' => ['required_if:role,livreur,voyageur', 'nullable', 'string', 'max:50'],
            'license' => ['required_if:role,livreur', 'nullable', 'string', 'max:50'],
            'vehicle_type' => ['required_if:role,livreur', 'nullable', 'string', 'max:50'],
            'vehicle_plate' => ['required_if:role,livreur', 'nullable', 'string', 'max:50'],
        ];
    }
}
