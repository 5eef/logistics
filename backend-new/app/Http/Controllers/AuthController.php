<?php

namespace App\Http\Controllers;

use App\Models\Notification;
use App\Models\User;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Hash;
use Illuminate\Support\Str;
use Illuminate\Validation\Rule;
use Illuminate\Validation\Rules\Password;

class AuthController extends Controller
{
    public function login(Request $request)
    {
        $request->merge(['email' => Str::lower(trim((string) $request->email))]);
        $request->validate([
            'email' => 'required|email|max:255',
            'password' => 'required|string|max:72',
        ]);

        $user = User::where('email', $request->email)->first();

        if (! $user || ! Hash::check($request->password, $user->password)) {
            return response()->json(['error' => 'Identifiants incorrects'], 401);
        }

        if ($user->is_banned) {
            return response()->json(['error' => 'Compte suspendu définitivement'], 403);
        }

        if ($user->suspended_until && $user->suspended_until > now()) {
            return response()->json(['error' => 'Compte suspendu temporairement'], 403);
        }

        $token = $user->createToken('auth_token')->plainTextToken;

        return response()->json([
            'token' => $token,
            'user' => $user->makeHidden('password'),
        ]);
    }

    public function register(Request $request)
    {
        $request->merge([
            'email' => Str::lower(trim((string) $request->email)),
            'phone' => preg_replace('/[\s().-]+/', '', trim((string) $request->phone)),
        ]);

        $request->validate([
            'name' => 'required|string|max:120',
            'email' => 'required|email|max:255|unique:users,email',
            'phone' => ['required', 'string', 'max:20', 'regex:/^\+?[0-9]{8,15}$/', 'unique:users,phone'],
            'password' => ['required', 'string', 'max:72', Password::min(10)->letters()->numbers()],
            'role' => 'required|in:expediteur,livreur,destinataire,voyageur',
            'city' => 'required|string|max:100',
            'cin' => 'required_if:role,livreur,voyageur|nullable|string|max:50',
            'license' => 'required_if:role,livreur|nullable|string|max:50',
            'vehicle_type' => 'required_if:role,livreur|nullable|string|max:50',
            'vehicle_plate' => 'required_if:role,livreur|nullable|string|max:50',
        ]);

        $user = User::create([
            'name' => $request->name,
            'email' => $request->email,
            'phone' => $request->phone,
            'password' => Hash::make($request->password),
            'role' => $request->role,
            'city' => $request->city,
            'cin' => $request->cin,
            'license_number' => $request->license,
            'vehicle_type' => $request->vehicle_type,
            'vehicle_plate' => $request->vehicle_plate,
            'verification_status' => in_array($request->role, ['livreur', 'voyageur']) ? 'pending' : 'approved',
            'is_verified' => ! in_array($request->role, ['livreur', 'voyageur'], true),
        ]);

        $token = $user->createToken('auth_token')->plainTextToken;

        return response()->json([
            'token' => $token,
            'user' => $user->makeHidden('password'),
        ], 201);
    }

    public function me(Request $request)
    {
        return response()->json($request->user()->makeHidden('password'));
    }

    public function logout(Request $request)
    {
        $request->user()->currentAccessToken()?->delete();

        return response()->json(['message' => 'Déconnecté avec succès']);
    }

    public function updateMe(Request $request)
    {
        $user = $request->user();

        if ($request->has('phone')) {
            $request->merge([
                'phone' => preg_replace('/[\s().-]+/', '', trim((string) $request->phone)),
            ]);
        }

        $validated = $request->validate([
            'name' => 'sometimes|required|string|max:120',
            'phone' => [
                'sometimes',
                'required',
                'string',
                'max:20',
                'regex:/^\+?[0-9]{8,15}$/',
                Rule::unique('users', 'phone')->ignore($user->id),
            ],
            'city' => 'sometimes|required|string|max:100',
            'is_online' => 'sometimes|required|boolean',
        ]);

        $isCarrier = in_array($user->role, ['livreur', 'voyageur'], true);
        if (! $isCarrier) {
            unset($validated['is_online']);
        } elseif (($validated['is_online'] ?? false)
            && (! $user->is_verified || $user->verification_status !== 'approved')) {
            return response()->json(
                ['error' => 'Un transporteur doit Ãªtre vÃ©rifiÃ© avant de passer en ligne'], 403
            );
        }

        $user->update($validated);

        return response()->json($user->makeHidden('password'));
    }

    public function notifications(Request $request)
    {
        $notifs = Notification::where('user_id', $request->user()->id)
            ->orderBy('created_at', 'desc')
            ->limit(100)
            ->get();

        return response()->json($notifs);
    }

    public function readNotification(Request $request, $id)
    {
        $notif = Notification::where('id', $id)->where('user_id', $request->user()->id)->first();
        if (! $notif) {
            return response()->json(['error' => 'Notification introuvable'], 404);
        }
        $notif->update(['is_read' => true]);

        return response()->json(['success' => true]);
    }
}
