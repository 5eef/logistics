<?php

namespace App\Http\Controllers;

use App\Http\Requests\LoginRequest;
use App\Http\Requests\RegisterRequest;
use App\Http\Resources\NotificationResource;
use App\Http\Resources\UserResource;
use App\Models\Notification;
use App\Models\User;
use App\Services\PhoneNormalizer;
use Illuminate\Auth\Events\PasswordReset;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Auth;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Hash;
use Illuminate\Support\Facades\Password;
use Illuminate\Support\Str;
use Illuminate\Validation\Rule;
use Illuminate\Validation\Rules\Password as PasswordRule;

class AuthController extends Controller
{
    public function login(LoginRequest $request): JsonResponse
    {
        if (! Auth::attempt($request->validated(), false)) {
            return response()->json(['error' => 'Identifiants incorrects'], 401);
        }
        $user = $request->user();
        if ($user->is_banned || $user->suspended_until?->isFuture()) {
            Auth::guard('web')->logout();

            return response()->json([
                'error' => $user->is_banned ? 'Compte suspendu définitivement' : 'Compte suspendu temporairement',
            ], 403);
        }
        $request->session()->regenerate();

        return response()->json(['user' => UserResource::make($user)->resolve()]);
    }

    public function register(RegisterRequest $request): JsonResponse
    {
        $validated = $request->validated();
        $user = User::create([
            'name' => $validated['name'], 'email' => $validated['email'], 'phone' => $validated['phone'],
            'password' => Hash::make($validated['password']), 'role' => $validated['role'], 'city' => $validated['city'],
            'cin' => $validated['cin'] ?? null, 'license_number' => $validated['license'] ?? null,
            'vehicle_type' => $validated['vehicle_type'] ?? null, 'vehicle_plate' => $validated['vehicle_plate'] ?? null,
            'verification_status' => in_array($validated['role'], ['livreur', 'voyageur'], true) ? 'pending' : 'approved',
            'is_verified' => ! in_array($validated['role'], ['livreur', 'voyageur'], true),
            'phone_verified_at' => null,
        ]);
        Auth::guard('web')->login($user);
        $request->session()->regenerate();

        return response()->json(['user' => UserResource::make($user)->resolve()], 201);
    }

    public function me(Request $request): UserResource
    {
        return new UserResource($request->user());
    }

    public function logout(Request $request): JsonResponse
    {
        Auth::guard('web')->logout();
        $request->session()->invalidate();
        $request->session()->regenerateToken();

        return response()->json(['message' => 'Déconnecté avec succès']);
    }

    public function updateMe(Request $request): UserResource
    {
        $user = $request->user();
        if ($request->has('phone')) {
            $request->merge(['phone' => PhoneNormalizer::normalize($request->input('phone'))]);
        }
        $validated = $request->validate([
            'name' => ['sometimes', 'required', 'string', 'max:120'],
            'phone' => ['sometimes', 'required', 'string', 'max:20', 'regex:/^\+212[5-8][0-9]{8}$/', Rule::unique('users', 'phone')->ignore($user->id)],
            'city' => ['sometimes', 'required', Rule::in(config('logistics.cities'))],
            'is_online' => ['sometimes', 'required', 'boolean'],
        ]);
        if (array_key_exists('phone', $validated) && $validated['phone'] !== $user->phone) {
            $validated['phone_verified_at'] = null;
        }
        $isCarrier = in_array($user->role, ['livreur', 'voyageur'], true);
        if (! $isCarrier) {
            unset($validated['is_online']);
        } elseif (($validated['is_online'] ?? false) && (! $user->is_verified || $user->verification_status !== 'approved')) {
            abort(403, 'Un transporteur doit être vérifié avant de passer en ligne.');
        }
        $user->update($validated);

        return new UserResource($user->fresh());
    }

    public function notifications(Request $request)
    {
        $perPage = min(max(1, $request->integer('per_page', config('logistics.pagination.default'))), (int) config('logistics.pagination.maximum'));
        $items = Notification::query()->where('user_id', $request->user()->id)->latest()->paginate($perPage);

        return NotificationResource::collection($items);
    }

    public function readNotification(Request $request, int $id): JsonResponse
    {
        $notification = Notification::query()->whereKey($id)->where('user_id', $request->user()->id)->firstOrFail();
        $notification->update(['is_read' => true]);

        return response()->json(['success' => true]);
    }

    public function forgotPassword(Request $request): JsonResponse
    {
        $validated = $request->validate(['email' => ['required', 'email', 'max:255']]);
        Password::sendResetLink(['email' => Str::lower(trim($validated['email']))]);

        return response()->json(['message' => 'Si ce compte existe, un lien de réinitialisation a été envoyé.']);
    }

    public function resetPassword(Request $request): JsonResponse
    {
        $request->merge(['email' => Str::lower(trim((string) $request->input('email')))]);
        $validated = $request->validate([
            'token' => ['required', 'string'], 'email' => ['required', 'email', 'max:255'],
            'password' => ['required', 'confirmed', PasswordRule::min(10)->letters()->numbers()],
        ]);
        $status = Password::reset($validated, function (User $user, string $password) {
            $user->forceFill(['password' => Hash::make($password), 'remember_token' => Str::random(60)])->save();
            $user->tokens()->delete();
            if (config('session.driver') === 'database') {
                DB::table(config('session.table', 'sessions'))->where('user_id', $user->id)->delete();
            }
            event(new PasswordReset($user));
        });

        if ($status !== Password::PASSWORD_RESET) {
            return response()->json(['error' => 'Le lien est invalide ou expiré.'], 422);
        }

        return response()->json(['message' => 'Mot de passe réinitialisé.']);
    }
}
