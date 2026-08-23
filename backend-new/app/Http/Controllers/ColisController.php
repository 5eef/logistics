<?php

namespace App\Http\Controllers;

use App\Http\Requests\CreateShipmentRequest;
use App\Http\Requests\RateShipmentRequest;
use App\Http\Requests\ShipmentQuoteRequest;
use App\Http\Requests\UpdateShipmentStatusRequest;
use App\Http\Requests\ValidateDeliveryPinRequest;
use App\Http\Resources\PublicTrackingResource;
use App\Http\Resources\ShipmentResource;
use App\Models\Colis;
use App\Models\Notification;
use App\Models\Rating;
use App\Models\TravelerTrip;
use App\Models\User;
use App\Services\DeliveryService;
use App\Services\ShipmentPricingService;
use Illuminate\Database\QueryException;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Gate;
use Illuminate\Support\Facades\Hash;
use Illuminate\Support\Str;
use Illuminate\Validation\ValidationException;

class ColisController extends Controller
{
    public function track(string $trackingId): PublicTrackingResource
    {
        $colis = Colis::with([
            'statusHistory:id,colis_id,status,message,city,created_at',
            'livreur:id,name,city,rating,rating_count,vehicle_type',
            'voyageur:id,name,city,rating,rating_count,vehicle_type',
        ])->where('tracking_id', strtoupper($trackingId))->firstOrFail();

        return new PublicTrackingResource($colis);
    }

    public function quote(ShipmentQuoteRequest $request, ShipmentPricingService $pricing): JsonResponse
    {
        $data = $request->validated();

        return response()->json($pricing->quote($data['from_city'], $data['to_city'], $data['weight']));
    }

    public function stats(Request $request): JsonResponse
    {
        $query = $this->visibleTo($request, DB::table('colis'));
        $row = $query->selectRaw(
            "COUNT(*) as total,
            SUM(CASE WHEN status = 'pending' THEN 1 ELSE 0 END) as pending,
            SUM(CASE WHEN status IN ('in_transit','picked_up','out_for_delivery') THEN 1 ELSE 0 END) as in_transit,
            SUM(CASE WHEN status = 'delivered' THEN 1 ELSE 0 END) as delivered,
            SUM(CASE WHEN status = 'failed' THEN 1 ELSE 0 END) as failed,
            COALESCE(SUM(CASE WHEN payment_status = 'paid' AND paid_at IS NOT NULL THEN price ELSE 0 END), 0) as revenue"
        )->first();

        return response()->json([
            'total' => (int) $row->total,
            'pending' => (int) $row->pending,
            'in_transit' => (int) $row->in_transit,
            'delivered' => (int) $row->delivered,
            'failed' => (int) $row->failed,
            'revenue' => number_format((float) $row->revenue, 2, '.', ''),
        ]);
    }

    public function index(Request $request)
    {
        $request->validate([
            'status' => ['nullable', 'string', 'max:30'],
            'trip_id' => ['nullable', 'integer', 'exists:traveler_trips,id'],
            'page' => ['nullable', 'integer', 'min:1'],
            'per_page' => ['nullable', 'integer', 'min:1', 'max:100'],
        ]);
        $user = $request->user();
        $query = Colis::with(['statusHistory', 'livreur:id,name,city,rating,rating_count,vehicle_type', 'voyageur:id,name,city,rating,rating_count,vehicle_type']);

        if ($user->role === 'expediteur') {
            $query->where('expediteur_id', $user->id);
        } elseif ($user->role === 'livreur') {
            if ($request->string('status')->toString() === 'available') {
                $this->ensureVerifiedCarrier($user);
                $query->where('status', 'pending')
                    ->where(fn ($q) => $q->where('from_city', $user->city)->orWhere('to_city', $user->city))
                    ->whereNull('livreur_id')->whereNull('voyageur_id');
            } else {
                $query->where('livreur_id', $user->id);
            }
        } elseif ($user->role === 'destinataire') {
            $query->where('destinataire_id', $user->id);
        } elseif ($user->role === 'voyageur') {
            if ($request->filled('trip_id')) {
                $this->ensureVerifiedCarrier($user);
                $trip = TravelerTrip::query()->whereKey($request->integer('trip_id'))->where('user_id', $user->id)
                    ->where('status', 'active')->whereDate('departure_date', '>=', today())->firstOrFail();
                $query->where('status', 'pending')->where('from_city', $trip->from_city)->where('to_city', $trip->to_city)
                    ->where('is_voyageur_eligible', true)->whereNull('livreur_id')->whereNull('voyageur_id');
            } else {
                $query->where('voyageur_id', $user->id);
            }
        }

        $perPage = min(max(1, $request->integer('per_page', config('logistics.pagination.default'))), (int) config('logistics.pagination.maximum'));
        $items = $query->latest()->paginate($perPage);

        return ShipmentResource::collection($items);
    }

    public function store(CreateShipmentRequest $request, ShipmentPricingService $pricing): JsonResponse
    {
        $validated = $request->validated();
        $user = $request->user();
        $requestId = $validated['client_request_id'] ?? $request->header('Idempotency-Key');
        if ($requestId && ! Str::isUuid($requestId)) {
            throw ValidationException::withMessages(['client_request_id' => 'La clé d’idempotence doit être un UUID.']);
        }
        if ($requestId) {
            $existing = Colis::query()->where('expediteur_id', $user->id)->where('client_request_id', $requestId)->first();
            if ($existing) {
                return response()->json(array_merge(
                    ShipmentResource::make($existing->load('statusHistory'))->resolve(),
                    ['idempotent_replay' => true]
                ));
            }
        }

        $quote = $pricing->quote($validated['from_city'], $validated['to_city'], $validated['weight']);
        $pinCode = (string) random_int(1000, 9999);
        $recipient = User::query()->where('phone', $validated['recipient_phone'])->whereNotNull('phone_verified_at')->first();

        try {
            $colis = DB::transaction(function () use ($validated, $user, $requestId, $quote, $pinCode, $recipient) {
                do {
                    $trackingId = 'LOG'.strtoupper(Str::random(12));
                } while (Colis::where('tracking_id', $trackingId)->exists());

                $colis = Colis::create([
                    ...$validated,
                    'client_request_id' => $requestId,
                    'tracking_id' => $trackingId,
                    'expediteur_id' => $user->id,
                    'destinataire_id' => $recipient?->id,
                    'price' => $quote['amount'],
                    'status' => 'pending',
                    'description' => $validated['description'] ?? '',
                    'notes' => $validated['notes'] ?? '',
                    'is_voyageur_eligible' => $validated['is_voyageur_eligible'] ?? false,
                    'is_paid' => false,
                    'payment_status' => 'unpaid',
                    'pin_code' => Hash::make($pinCode),
                    'qr_code' => 'QR_'.Str::random(16),
                    'estimated_delivery' => now()->addDays($validated['from_city'] === $validated['to_city'] ? 1 : 2),
                ]);
                $colis->statusHistory()->createMany([
                    ['status' => 'created', 'message' => 'Colis créé par l’expéditeur', 'city' => $validated['from_city'], 'updated_by' => $user->id],
                    ['status' => 'pending', 'message' => 'En attente d’un transporteur', 'city' => $validated['from_city'], 'updated_by' => $user->id],
                ]);
                Notification::create([
                    'user_id' => $user->id, 'title' => 'Colis créé',
                    'message' => "Votre colis {$colis->tracking_id} a été créé avec succès.", 'type' => 'success',
                ]);

                return $colis;
            });
        } catch (QueryException $exception) {
            if (! $requestId || ! $this->isSenderRequestCollision($exception)) {
                throw $exception;
            }
            $colis = Colis::query()
                ->where('expediteur_id', $user->id)
                ->where('client_request_id', $requestId)
                ->first();
            if (! $colis) {
                throw $exception;
            }

            return response()->json(array_merge(
                ShipmentResource::make($colis->load('statusHistory'))->resolve(),
                ['idempotent_replay' => true]
            ));
        }

        return response()->json(array_merge(
            ShipmentResource::make($colis->load('statusHistory'))->resolve(),
            ['pin_code' => $pinCode, 'idempotent_replay' => false]
        ), 201);
    }

    public function updateStatus(UpdateShipmentStatusRequest $request, int $id, DeliveryService $delivery): ShipmentResource
    {
        $data = $request->validated();
        $colis = $delivery->updateStatus($request->user(), $id, $data['status'], $data['message'] ?? null, $data['trip_id'] ?? null);

        return new ShipmentResource($colis->load('statusHistory'));
    }

    public function validatePin(ValidateDeliveryPinRequest $request, int $id, DeliveryService $delivery): JsonResponse
    {
        $colis = $delivery->validatePin($request->user(), $id, $request->validated('pin'));

        return response()->json(['success' => true, 'colis' => ShipmentResource::make($colis->load('statusHistory'))->resolve()]);
    }

    public function rate(RateShipmentRequest $request, int $id): JsonResponse
    {
        $data = $request->validated();
        $user = $request->user();

        try {
            $rating = DB::transaction(function () use ($id, $data, $user) {
                $colis = Colis::query()->whereKey($id)->lockForUpdate()->firstOrFail();
                Gate::forUser($user)->authorize('rate', $colis);
                $carrierId = $colis->livreur_id ?? $colis->voyageur_id;
                if (! $carrierId || (int) $data['to_user_id'] !== (int) $carrierId) {
                    throw ValidationException::withMessages(['to_user_id' => 'Transporteur invalide.']);
                }
                $rating = Rating::create([
                    'from_user_id' => $user->id, 'to_user_id' => $carrierId, 'colis_id' => $id,
                    'score' => $data['score'], 'comment' => $data['comment'] ?? '',
                ]);
                $aggregate = DB::table('ratings')->where('to_user_id', $carrierId)
                    ->selectRaw('AVG(score) as average_score, COUNT(*) as rating_count')->first();
                if (! $aggregate) {
                    abort(500, 'Agrégation de note impossible.');
                }
                User::query()->whereKey($carrierId)->update([
                    'rating' => round((float) $aggregate->average_score, 1),
                    'rating_count' => (int) $aggregate->rating_count,
                ]);

                return $rating;
            });
        } catch (QueryException $e) {
            if (in_array((string) $e->getCode(), ['23000', '19'], true)) {
                return response()->json(['error' => 'Ce colis a déjà été noté.'], 409);
            }
            throw $e;
        }

        return response()->json($rating, 201);
    }

    private function ensureVerifiedCarrier(User $user): void
    {
        abort_unless($user->is_verified && $user->verification_status === 'approved', 403, 'Compte transporteur non vérifié.');
    }

    private function isSenderRequestCollision(QueryException $exception): bool
    {
        $message = strtolower($exception->getMessage());

        return in_array((string) $exception->getCode(), ['23000', '23505'], true)
            && (str_contains($message, 'colis_sender_request_unique')
                || str_contains($message, 'colis.expediteur_id, colis.client_request_id'));
    }

    private function visibleTo(Request $request, $query)
    {
        $user = $request->user();
        if ($user->role === 'expediteur') {
            return $query->where('expediteur_id', $user->id);
        }
        if ($user->role === 'livreur') {
            return $query->where('livreur_id', $user->id);
        }
        if ($user->role === 'voyageur') {
            return $query->where('voyageur_id', $user->id);
        }
        if ($user->role === 'destinataire') {
            return $query->where('destinataire_id', $user->id);
        }

        return $query;
    }
}
