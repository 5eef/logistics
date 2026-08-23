<?php

namespace App\Services;

use App\Contracts\PhoneVerificationProvider;
use RuntimeException;

final class FailClosedPhoneVerificationProvider implements PhoneVerificationProvider
{
    public function start(string $phone): void
    {
        throw new RuntimeException('Aucun fournisseur de vérification téléphonique n’est configuré.');
    }

    public function confirm(string $phone, string $code): bool
    {
        throw new RuntimeException('Aucun fournisseur de vÃ©rification tÃ©lÃ©phonique nâ€™est configurÃ©.');
    }
}
