<?php

namespace App\Http\Requests;

use Illuminate\Foundation\Http\FormRequest;
use Illuminate\Validation\Rule;

class CreateTravelerTripRequest extends FormRequest
{
    public function authorize(): bool
    {
        return $this->user()?->role === 'voyageur';
    }

    public function rules(): array
    {
        $cities = config('logistics.cities');

        return [
            'from_city' => ['required', Rule::in($cities), 'different:to_city'],
            'to_city' => ['required', Rule::in($cities)],
            'departure_date' => [
                'required',
                'date',
                'after_or_equal:today',
                'before_or_equal:'.today()->addDays((int) config('logistics.traveler_trips.maximum_horizon_days', 90))->toDateString(),
            ],
        ];
    }
}
