<?php

namespace App\Http\Controllers;

use App\Models\Notification;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Storage;
use Illuminate\Validation\Rule;

class ProfileController extends Controller
{
    public function show(Request $request)
    {
        return response()->json($request->user());
    }

    public function update(Request $request)
    {
        $user = $request->user();
        if ($request->has('phone')) {
            $request->merge([
                'phone' => preg_replace('/[\s().-]+/', '', trim((string) $request->phone)),
            ]);
        }
        $rules = [
            'name' => ['required', 'string', 'max:120'],
            'phone' => ['required', 'string', 'max:20', 'regex:/^\+?[0-9]{8,15}$/', Rule::unique('users', 'phone')->ignore($user->id)],
            'city' => ['required', 'string', 'max:100'],
        ];

        if (in_array($user->role, ['livreur', 'voyageur'], true)) {
            $rules['vehicle_type'] = ['nullable', 'string', 'max:50'];
            $rules['vehicle_plate'] = ['nullable', 'string', 'max:50'];
        }

        $user->update($request->validate($rules));
        Notification::create([
            'user_id' => $user->id,
            'title' => 'Profil mis à jour',
            'message' => 'Vos informations de profil ont été mises à jour.',
            'type' => 'success',
        ]);

        return response()->json($user->fresh());
    }

    public function updateAvatar(Request $request)
    {
        $request->validate([
            'avatar' => ['required', 'image', 'mimes:jpg,jpeg,png,webp', 'max:2048'],
        ]);

        $user = $request->user();
        $previousPath = $user->avatar_path;
        $newPath = $request->file('avatar')->store('avatars', 'public');

        $user->update(['avatar_path' => $newPath]);
        if ($previousPath) {
            Storage::disk('public')->delete($previousPath);
        }

        return response()->json($user->fresh());
    }

    public function avatar(string $filename)
    {
        $path = 'avatars/'.basename($filename);
        abort_unless(Storage::disk('public')->exists($path), 404);

        return Storage::disk('public')->response($path);
    }
}
