<?php

namespace App\Http\Controllers;

use App\Http\Resources\UserResource;
use App\Models\Notification;
use App\Services\AuditLogger;
use App\Services\PhoneNormalizer;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Storage;
use Illuminate\Validation\Rule;

class ProfileController extends Controller
{
    public function show(Request $request): UserResource
    {
        return new UserResource($request->user());
    }

    public function update(Request $request, AuditLogger $audit): UserResource
    {
        $user = $request->user();
        if ($request->has('phone')) {
            $request->merge(['phone' => PhoneNormalizer::normalize($request->input('phone'))]);
        }
        $rules = [
            'name' => ['required', 'string', 'max:120'],
            'phone' => ['required', 'string', 'max:20', 'regex:/^\+212[5-8][0-9]{8}$/', Rule::unique('users', 'phone')->ignore($user->id)],
            'city' => ['required', Rule::in(config('logistics.cities'))],
        ];
        if (in_array($user->role, ['livreur', 'voyageur'], true)) {
            $rules['vehicle_type'] = ['nullable', 'string', 'max:50'];
            $rules['vehicle_plate'] = ['nullable', 'string', 'max:50'];
        }
        $validated = $request->validate($rules);
        if ($validated['phone'] !== $user->phone) {
            $validated['phone_verified_at'] = null;
        }
        $verificationFieldsChanged = in_array($user->role, ['livreur', 'voyageur'], true)
            && (($validated['vehicle_type'] ?? null) !== $user->vehicle_type
                || ($validated['vehicle_plate'] ?? null) !== $user->vehicle_plate);
        $old = $user->only(['vehicle_type', 'vehicle_plate', 'verification_status', 'is_verified', 'verified_at', 'verified_by']);
        if ($verificationFieldsChanged) {
            $validated = array_merge($validated, [
                'verification_status' => 'pending',
                'is_verified' => false,
                'verified_at' => null,
                'verified_by' => null,
                'verification_reason' => 'DonnÃ©es du vÃ©hicule modifiÃ©es par le transporteur.',
                'is_online' => false,
            ]);
        }
        DB::transaction(function () use ($user, $validated, $verificationFieldsChanged, $audit, $old) {
            $user->update($validated);
            if ($verificationFieldsChanged) {
                $audit->record(
                    $user,
                    'courier.verification_data_changed',
                    $user,
                    'Modification des donnÃ©es du vÃ©hicule',
                    $old,
                    $user->only(['vehicle_type', 'vehicle_plate', 'verification_status', 'is_verified', 'verified_at', 'verified_by'])
                );
            }
        });
        Notification::create([
            'user_id' => $user->id, 'title' => 'Profil mis à jour',
            'message' => 'Vos informations de profil ont été mises à jour.', 'type' => 'success',
        ]);

        return new UserResource($user->fresh());
    }

    public function updateAvatar(Request $request): UserResource
    {
        $request->validate([
            'avatar' => ['required', 'image', 'mimes:jpg,jpeg,png,webp', 'max:2048', 'dimensions:max_width=4096,max_height=4096'],
        ]);
        $user = $request->user();
        $previousPath = $user->avatar_path;
        $newPath = $request->file('avatar')->store('avatars', 'public');
        $user->update(['avatar_path' => $newPath]);
        if ($previousPath) {
            Storage::disk('public')->delete($previousPath);
        }

        return new UserResource($user->fresh());
    }

    public function avatar(string $filename)
    {
        $path = 'avatars/'.basename($filename);
        abort_unless(Storage::disk('public')->exists($path), 404);

        return Storage::disk('public')->response($path);
    }
}
