<?php

return [
    'frontend_url' => env('FRONTEND_URL', 'http://127.0.0.1:5173'),

    'phone_verification' => [
        'enabled' => (bool) env('PHONE_VERIFICATION_ENABLED', false),
        'driver' => env('PHONE_VERIFICATION_DRIVER', 'fail_closed'),
        'local_code' => env('PHONE_VERIFICATION_LOCAL_CODE', '123456'),
        'ttl_seconds' => 600,
    ],

    'cities' => [
        'Casablanca', 'Rabat', 'Marrakech', 'Fès', 'Tanger', 'Agadir',
        'Meknès', 'Oujda', 'Kénitra', 'Tétouan', 'Safi', 'Mohammedia',
        'Khouribga', 'Béni Mellal', 'El Jadida', 'Nador', 'Settat', 'Laâyoune',
    ],

    'pricing' => [
        'same_city_base_cents' => 3000,
        'different_city_base_cents' => 6000,
        'weight_cents_per_kg' => 500,
        'currency' => 'MAD',
    ],

    'pagination' => [
        'default' => 20,
        'maximum' => 100,
    ],

    'traveler_trips' => [
        'maximum_active' => 10,
        'maximum_horizon_days' => 90,
    ],

    'delivery_pin' => [
        'maximum_attempts' => 5,
        'lock_minutes' => 15,
    ],
];
