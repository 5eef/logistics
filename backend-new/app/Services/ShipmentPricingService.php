<?php

namespace App\Services;

use InvalidArgumentException;

final class ShipmentPricingService
{
    /** @return array{amount: string, currency: string} */
    public function quote(string $fromCity, string $toCity, string|int|float $weight): array
    {
        $weightGrams = $this->weightToGrams((string) $weight);
        $baseCents = (int) config(
            $fromCity === $toCity
                ? 'logistics.pricing.same_city_base_cents'
                : 'logistics.pricing.different_city_base_cents'
        );
        $perKgCents = (int) config('logistics.pricing.weight_cents_per_kg');
        $weightCents = intdiv(($weightGrams * $perKgCents) + 500, 1000);
        $totalCents = $baseCents + $weightCents;

        return [
            'amount' => sprintf('%d.%02d', intdiv($totalCents, 100), $totalCents % 100),
            'currency' => (string) config('logistics.pricing.currency', 'MAD'),
        ];
    }

    private function weightToGrams(string $weight): int
    {
        $weight = trim($weight);
        if (! preg_match('/^(\d{1,4})(?:\.(\d{1,3}))?$/', $weight, $matches)) {
            throw new InvalidArgumentException('Poids invalide.');
        }

        return ((int) $matches[1] * 1000) + (int) str_pad($matches[2] ?? '', 3, '0');
    }
}
