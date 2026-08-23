<?php

namespace App\Http\Controllers;

use App\Http\Requests\CreateTravelerTripRequest;
use App\Models\TravelerTrip;
use App\Models\User;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;
use Illuminate\Validation\ValidationException;

class TravelerTripController extends Controller
{
    public function index(Request $request): JsonResponse
    {
        abort_unless($request->user()->role === 'voyageur', 403);

        return response()->json(TravelerTrip::query()
            ->where('user_id', $request->user()->id)
            ->where('status', 'active')
            ->whereDate('departure_date', '>=', today())
            ->orderBy('departure_date')
            ->get());
    }

    public function store(CreateTravelerTripRequest $request): JsonResponse
    {
        $user = $request->user();
        abort_unless($user->is_verified && $user->verification_status === 'approved', 403, 'Compte voyageur non vérifié.');
        [$trip, $replay] = DB::transaction(function () use ($request, $user) {
            User::query()->whereKey($user->id)->lockForUpdate()->firstOrFail();
            $data = $request->validated();
            $existing = TravelerTrip::query()
                ->where('user_id', $user->id)
                ->where('from_city', $data['from_city'])
                ->where('to_city', $data['to_city'])
                ->whereDate('departure_date', $data['departure_date'])
                ->where('status', 'active')
                ->first();
            if ($existing) {
                return [$existing, true];
            }
            $activeCount = TravelerTrip::query()
                ->where('user_id', $user->id)
                ->where('status', 'active')
                ->whereDate('departure_date', '>=', today())
                ->count();
            if ($activeCount >= (int) config('logistics.traveler_trips.maximum_active', 10)) {
                throw ValidationException::withMessages(['trip' => 'Le nombre maximal de trajets actifs est atteint.']);
            }

            return [TravelerTrip::create([...$data, 'user_id' => $user->id, 'status' => 'active']), false];
        });

        return response()->json([...$trip->toArray(), 'idempotent_replay' => $replay], $replay ? 200 : 201);
    }

    public function cancel(Request $request, int $id): JsonResponse
    {
        abort_unless($request->user()->role === 'voyageur', 403);
        $trip = TravelerTrip::query()->whereKey($id)->where('user_id', $request->user()->id)->firstOrFail();
        $trip->update(['status' => 'cancelled']);

        return response()->json($trip);
    }
}
