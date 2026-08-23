<?php

namespace App\Contracts;

interface PhoneVerificationProvider
{
    public function start(string $phone): void;

    public function confirm(string $phone, string $code): bool;
}
