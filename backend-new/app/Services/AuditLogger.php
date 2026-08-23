<?php

namespace App\Services;

use App\Models\AuditLog;
use App\Models\User;
use Illuminate\Database\Eloquent\Model;

final class AuditLogger
{
    private const SENSITIVE_KEYS = [
        'password', 'pin', 'pin_code', 'token', 'authorization', 'cookie', 'app_key', 'db_password',
    ];

    public function record(User $actor, string $action, Model $target, string $reason, array $old, array $new): void
    {
        AuditLog::create([
            'actor_user_id' => $actor->id,
            'action' => $action,
            'target_type' => $target::class,
            'target_id' => $target->getKey(),
            'reason' => $reason,
            'old_values' => $this->sanitize($old),
            'new_values' => $this->sanitize($new),
        ]);
    }

    private function sanitize(array $values): array
    {
        return array_filter(
            $values,
            fn (string $key) => ! in_array(strtolower($key), self::SENSITIVE_KEYS, true),
            ARRAY_FILTER_USE_KEY
        );
    }
}
