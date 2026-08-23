<?php

namespace App\Http\Controllers;

use App\Contracts\PhoneVerificationProvider;
use App\Http\Requests\ConfirmPhoneVerificationRequest;
use App\Http\Requests\StartPhoneVerificationRequest;
use App\Models\Colis;
use App\Models\User;
use App\Services\PhoneNormalizer;
use Illuminate\Http\JsonResponse;
use Illuminate\Support\Facades\DB;
use RuntimeException;

class PhoneVerificationController extends Controller
{
    public function start(StartPhoneVerificationRequest $request, PhoneVerificationProvider $provider): JsonResponse
    {
        if (! config('logistics.phone_verification.enabled')) {
            return response()->json(['error' => 'La vÃ©rification tÃ©lÃ©phonique est indisponible.'], 503);
        }

        $phone = PhoneNormalizer::normalize($request->user()->phone);
        abort_unless(PhoneNormalizer::isSupportedMoroccanNumber($phone), 422, 'NumÃ©ro marocain invalide.');

        try {
            $provider->start($phone);
        } catch (RuntimeException) {
            return response()->json(['error' => 'La vÃ©rification tÃ©lÃ©phonique est indisponible.'], 503);
        }

        return response()->json(['message' => 'Un code de vÃ©rification a Ã©tÃ© envoyÃ©.']);
    }

    public function confirm(ConfirmPhoneVerificationRequest $request, PhoneVerificationProvider $provider): JsonResponse
    {
        if (! config('logistics.phone_verification.enabled')) {
            return response()->json(['error' => 'La vÃ©rification tÃ©lÃ©phonique est indisponible.'], 503);
        }

        $phone = PhoneNormalizer::normalize($request->user()->phone);
        try {
            $confirmed = $provider->confirm($phone, $request->validated('code'));
        } catch (RuntimeException) {
            return response()->json(['error' => 'La vÃ©rification tÃ©lÃ©phonique est indisponible.'], 503);
        }
        if (! $confirmed) {
            return response()->json(['error' => 'Code de vÃ©rification incorrect ou expirÃ©.'], 422);
        }

        $linked = DB::transaction(function () use ($request, $phone) {
            /** @var User $user */
            $user = User::query()->whereKey($request->user()->id)->lockForUpdate()->firstOrFail();
            $user->forceFill(['phone' => $phone, 'phone_verified_at' => now()])->save();

            if ($user->role !== 'destinataire') {
                return 0;
            }

            return Colis::query()
                ->whereNull('destinataire_id')
                ->where('recipient_phone', $phone)
                ->update(['destinataire_id' => $user->id]);
        });

        return response()->json([
            'message' => 'NumÃ©ro de tÃ©lÃ©phone vÃ©rifiÃ©.',
            'linked_shipments' => $linked,
        ]);
    }
}
