<?php

namespace App\Services;

use App\Contracts\PhoneVerificationProvider;
use Illuminate\Contracts\Cache\Repository as CacheRepository;

final class LocalPhoneVerificationProvider implements PhoneVerificationProvider
{
    public function __construct(private CacheRepository $cache) {}

    public function start(string $phone): void
    {
        $this->cache->put(
            $this->key($phone),
            hash('sha256', (string) config('logistics.phone_verification.local_code')),
            (int) config('logistics.phone_verification.ttl_seconds', 600)
        );
    }

    public function confirm(string $phone, string $code): bool
    {
        $key = $this->key($phone);
        $expected = $this->cache->get($key);
        if (! is_string($expected) || ! hash_equals($expected, hash('sha256', $code))) {
            return false;
        }

        $this->cache->forget($key);

        return true;
    }

    private function key(string $phone): string
    {
        return 'phone-verification:'.hash('sha256', $phone);
    }
}
