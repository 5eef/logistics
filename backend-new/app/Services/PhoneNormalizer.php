<?php

namespace App\Services;

final class PhoneNormalizer
{
    public static function normalize(?string $phone): string
    {
        $value = preg_replace('/[\s().\-\/]+/', '', trim((string) $phone)) ?? '';

        if (str_starts_with($value, '00')) {
            $value = '+'.substr($value, 2);
        }

        if (preg_match('/^0([5-8][0-9]{8})$/', $value, $matches) === 1) {
            return '+212'.$matches[1];
        }

        if (preg_match('/^212([5-8][0-9]{8})$/', $value, $matches) === 1) {
            return '+212'.$matches[1];
        }

        return $value;
    }

    public static function isSupportedMoroccanNumber(?string $phone): bool
    {
        return preg_match('/^\+212[5-8][0-9]{8}$/', self::normalize($phone)) === 1;
    }
}
