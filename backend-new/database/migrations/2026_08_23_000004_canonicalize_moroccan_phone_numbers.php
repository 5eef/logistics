<?php

use App\Services\PhoneNormalizer;
use Illuminate\Database\Migrations\Migration;
use Illuminate\Support\Facades\DB;

return new class extends Migration
{
    public function up(): void
    {
        $canonicalByUser = [];
        $usersByCanonical = [];

        foreach (DB::table('users')->select(['id', 'phone'])->orderBy('id')->get() as $user) {
            $canonical = PhoneNormalizer::normalize($user->phone);
            if (! PhoneNormalizer::isSupportedMoroccanNumber($canonical)) {
                throw new RuntimeException("Phone canonicalization stopped: user {$user->id} has an unsupported phone format.");
            }
            $canonicalByUser[(int) $user->id] = $canonical;
            $usersByCanonical[$canonical][] = (int) $user->id;
        }

        $collisions = array_filter($usersByCanonical, fn (array $ids): bool => count($ids) > 1);
        if ($collisions !== []) {
            $report = collect($collisions)->map(function (array $ids, string $phone): string {
                return 'users='.implode(',', $ids).', phone=***'.substr($phone, -4);
            })->implode('; ');

            throw new RuntimeException('Phone canonicalization stopped because account collisions require operator review: '.$report);
        }

        DB::transaction(function () use ($canonicalByUser) {
            foreach ($canonicalByUser as $id => $phone) {
                DB::table('users')->where('id', $id)->update(['phone' => $phone]);
            }
            DB::table('colis')->select(['id', 'recipient_phone'])->orderBy('id')->chunkById(500, function ($shipments) {
                foreach ($shipments as $shipment) {
                    $canonical = PhoneNormalizer::normalize($shipment->recipient_phone);
                    if (PhoneNormalizer::isSupportedMoroccanNumber($canonical)) {
                        DB::table('colis')->where('id', $shipment->id)->update(['recipient_phone' => $canonical]);
                    }
                }
            });
        });
    }

    public function down(): void
    {
        // Canonical E.164 values cannot be losslessly converted back to the
        // user's original formatting. Rollback intentionally leaves them.
    }
};
