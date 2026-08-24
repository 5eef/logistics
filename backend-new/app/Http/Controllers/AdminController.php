<?php

namespace App\Http\Controllers;

use App\Http\Resources\AdminUserResource;
use App\Http\Resources\ShipmentResource;
use App\Http\Resources\TicketResource;
use App\Models\Colis;
use App\Models\Notification;
use App\Models\Ticket;
use App\Models\User;
use App\Services\AuditLogger;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;
use Illuminate\Validation\Rule;

class AdminController extends Controller
{
    public function stats(): JsonResponse
    {
        $totals = DB::table('colis')->selectRaw(
            "COUNT(*) as total, SUM(CASE WHEN status = 'delivered' THEN 1 ELSE 0 END) as delivered,
            SUM(CASE WHEN status = 'pending' THEN 1 ELSE 0 END) as pending,
            COALESCE(SUM(CASE WHEN payment_status = 'paid' AND paid_at IS NOT NULL THEN price ELSE 0 END), 0) as revenue"
        )->first();
        $cityStats = Colis::selectRaw('from_city as city, COUNT(*) as count')->groupBy('from_city')->orderByDesc('count')->limit(50)->get();
        $since = now()->startOfMonth()->subMonths(11);
        $driver = DB::getDriverName();
        $period = $driver === 'sqlite' ? "strftime('%Y-%m', created_at)" : "DATE_FORMAT(created_at, '%Y-%m')";
        $monthlyData = DB::table('colis')->where('created_at', '>=', $since)
            ->selectRaw("{$period} as month, COUNT(*) as colis, COALESCE(SUM(CASE WHEN payment_status = 'paid' AND paid_at IS NOT NULL THEN price ELSE 0 END), 0) as revenue")
            ->groupBy('month')->orderBy('month')->get();
        $statusCounts = Colis::query()->selectRaw('status, COUNT(*) as aggregate')->groupBy('status')->pluck('aggregate', 'status');
        $total = (int) $totals->total;
        $delivered = (int) $totals->delivered;

        return response()->json([
            'totalColis' => $total, 'deliveredColis' => $delivered, 'pendingColis' => (int) $totals->pending,
            'totalRevenue' => number_format((float) $totals->revenue, 2, '.', ''),
            'totalUsers' => User::where('role', '!=', 'admin')->count(),
            'totalLivreurs' => User::where('role', 'livreur')->count(),
            'pendingVerifications' => User::whereIn('role', ['livreur', 'voyageur'])->where('verification_status', 'pending')->count(),
            'openTickets' => Ticket::where('status', 'open')->count(),
            'deliveryRate' => $total > 0 ? round(($delivered / $total) * 100) : 0,
            'cityStats' => $cityStats,
            'statusStats' => collect([
                'created' => 'Créé', 'pending' => 'En attente', 'picked_up' => 'Récupéré',
                'in_transit' => 'En transit', 'out_for_delivery' => 'En livraison',
                'delivered' => 'Livré', 'failed' => 'Échoué', 'returned' => 'Retourné',
            ])->map(fn ($name, $status) => ['name' => $name, 'value' => (int) ($statusCounts[$status] ?? 0)])->values(),
            'monthlyData' => $monthlyData->map(fn ($row) => [
                'month' => $row->month, 'colis' => (int) $row->colis,
                'revenue' => number_format((float) $row->revenue, 2, '.', ''),
            ]),
        ]);
    }

    public function users(Request $request)
    {
        $data = $this->validateFilters($request, ['role' => ['nullable', Rule::in(['expediteur', 'livreur', 'destinataire', 'voyageur'])]]);
        $query = User::query()->where('role', '!=', 'admin');
        if ($data['role'] ?? null) {
            $query->where('role', $data['role']);
        }
        if ($data['city'] ?? null) {
            $query->where('city', $data['city']);
        }
        if ($data['search'] ?? null) {
            $query->where(fn ($q) => $q->where('name', 'like', '%'.$data['search'].'%')->orWhere('email', 'like', '%'.$data['search'].'%'));
        }

        return AdminUserResource::collection($query->latest()->paginate($data['per_page'] ?? 20));
    }

    public function colis(Request $request)
    {
        $data = $this->validateFilters($request, ['status' => ['nullable', Rule::in(['created', 'pending', 'picked_up', 'in_transit', 'out_for_delivery', 'delivered', 'failed', 'returned'])]]);
        $query = Colis::with(['statusHistory', 'livreur', 'voyageur']);
        if ($data['status'] ?? null) {
            $query->where('status', $data['status']);
        }
        if ($data['city'] ?? null) {
            $query->where(fn ($q) => $q->where('from_city', $data['city'])->orWhere('to_city', $data['city']));
        }
        if ($data['search'] ?? null) {
            $query->where('tracking_id', 'like', '%'.strtoupper($data['search']).'%');
        }

        return ShipmentResource::collection($query->latest()->paginate($data['per_page'] ?? 20));
    }

    public function tickets(Request $request)
    {
        $data = $this->validateFilters($request, ['status' => ['nullable', Rule::in(['open', 'in_progress', 'resolved', 'closed'])]]);
        $query = Ticket::with('responses');
        if ($data['status'] ?? null) {
            $query->where('status', $data['status']);
        }

        return TicketResource::collection($query->latest()->paginate($data['per_page'] ?? 20));
    }

    public function updateTicket(Request $request, int $id, AuditLogger $audit): TicketResource
    {
        $validated = $request->validate([
            'status' => ['nullable', 'required_without:response', 'in:open,in_progress,resolved,closed'],
            'response' => ['nullable', 'required_without:status', 'string', 'regex:/\S/', 'max:5000'],
        ]);
        $ticket = DB::transaction(function () use ($request, $id, $validated, $audit) {
            $ticket = Ticket::whereKey($id)->lockForUpdate()->firstOrFail();
            $old = ['status' => $ticket->status, 'responses_count' => $ticket->responses()->count()];
            if (isset($validated['status'])) {
                $ticket->status = $validated['status'];
                $ticket->save();
            }
            if (! empty($validated['response'])) {
                $ticket->responses()->create([
                    'user_id' => $request->user()->id,
                    'user_name' => $request->user()->name,
                    'message' => $validated['response'],
                ]);
                Notification::create([
                    'user_id' => $ticket->user_id, 'title' => 'Réponse à votre ticket',
                    'message' => "Le support a répondu à votre ticket : {$ticket->subject}", 'type' => 'info',
                ]);
            }
            $audit->record(
                $request->user(),
                'ticket.updated',
                $ticket,
                ! empty($validated['response']) ? 'Réponse du support' : 'Changement de statut du ticket',
                $old,
                ['status' => $ticket->status, 'responses_count' => $ticket->responses()->count()]
            );

            return $ticket;
        });

        return new TicketResource($ticket->load('responses'));
    }

    public function pendingCouriers(Request $request)
    {
        $validated = $request->validate([
            'page' => ['nullable', 'integer', 'min:1'],
            'per_page' => ['nullable', 'integer', 'min:1', 'max:100'],
        ]);
        $items = User::whereIn('role', ['livreur', 'voyageur'])->where('verification_status', 'pending')->latest()->paginate($validated['per_page'] ?? 20);

        return AdminUserResource::collection($items);
    }

    public function verifyCourier(Request $request, int $id, AuditLogger $audit): AdminUserResource
    {
        $validated = $request->validate([
            'status' => ['required', 'in:approved,rejected'],
            'reason' => ['nullable', 'required_if:status,rejected', 'string', 'min:3', 'max:500'],
        ]);
        $reason = $validated['reason'] ?? 'Informations de vérification approuvées';
        $user = DB::transaction(function () use ($id, $validated, $request, $audit, $reason) {
            $user = User::whereIn('role', ['livreur', 'voyageur'])->whereKey($id)->lockForUpdate()->firstOrFail();
            $old = $user->only(['verification_status', 'is_verified', 'is_online', 'verified_at', 'verified_by', 'verification_reason']);
            $approved = $validated['status'] === 'approved';
            $new = [
                'verification_status' => $validated['status'], 'is_verified' => $approved,
                'is_online' => $approved ? $user->is_online : false,
                'verified_at' => $approved ? now() : null,
                'verified_by' => $request->user()->id, 'verification_reason' => $reason,
            ];
            $user->update($new);
            $audit->record($request->user(), 'courier.verification.'.$new['verification_status'], $user, $reason, $old, $new);
            Notification::create([
                'user_id' => $user->id, 'title' => $approved ? 'Compte approuvé !' : 'Vérification rejetée',
                'message' => $approved ? 'Vos informations ont été approuvées.' : 'Votre demande a été rejetée. Raison : '.$reason,
                'type' => $approved ? 'success' : 'error',
            ]);

            return $user;
        });
        if ($validated['status'] === 'rejected') {
            $this->revokeSessions($user);
        }

        return new AdminUserResource($user->fresh());
    }

    public function warnCourier(Request $request, int $id, AuditLogger $audit): AdminUserResource
    {
        $validated = $request->validate(['reason' => ['required', 'string', 'min:3', 'max:500']]);
        $user = DB::transaction(function () use ($id, $request, $validated, $audit) {
            $user = User::whereIn('role', ['livreur', 'voyageur'])->whereKey($id)->lockForUpdate()->firstOrFail();
            $old = $user->only(['warnings', 'suspended_until', 'is_banned', 'is_online']);
            $user->warnings++;
            if ($user->warnings === 2) {
                $user->suspended_until = now()->addDays(3);
            } elseif ($user->warnings === 3) {
                $user->suspended_until = now()->addDays(14);
            } elseif ($user->warnings >= 4) {
                $user->is_banned = true;
                $user->is_online = false;
            }
            $user->save();
            $audit->record($request->user(), 'courier.warned', $user, $validated['reason'], $old, $user->only(['warnings', 'suspended_until', 'is_banned', 'is_online']));
            Notification::create([
                'user_id' => $user->id, 'title' => 'Avertissement reçu',
                'message' => "Vous avez reçu un avertissement ({$user->warnings}/4). Raison : {$validated['reason']}", 'type' => 'warning',
            ]);

            return $user;
        });
        if ($user->suspended_until?->isFuture() || $user->is_banned) {
            $this->revokeSessions($user);
        }

        return new AdminUserResource($user->fresh());
    }

    public function banCourier(Request $request, int $id, AuditLogger $audit): AdminUserResource
    {
        $validated = $request->validate(['reason' => ['required', 'string', 'min:3', 'max:500']]);
        $user = DB::transaction(function () use ($id, $request, $validated, $audit) {
            $user = User::whereIn('role', ['livreur', 'voyageur'])->whereKey($id)->lockForUpdate()->firstOrFail();
            $old = $user->only(['is_banned', 'is_online']);
            $user->update(['is_banned' => true, 'is_online' => false]);
            $audit->record($request->user(), 'courier.banned', $user, $validated['reason'], $old, ['is_banned' => true, 'is_online' => false]);

            return $user;
        });
        $this->revokeSessions($user);

        return new AdminUserResource($user->fresh());
    }

    public function overrideStatus(Request $request, int $id, AuditLogger $audit): ShipmentResource
    {
        $validated = $request->validate([
            'status' => ['required', Rule::in(['pending', 'picked_up', 'in_transit', 'out_for_delivery', 'delivered', 'failed', 'returned'])],
            'reason' => ['required', 'string', 'min:3', 'max:500'],
        ]);
        $colis = DB::transaction(function () use ($request, $id, $validated, $audit) {
            $colis = Colis::whereKey($id)->lockForUpdate()->firstOrFail();
            $old = $colis->only(['status', 'delivered_at', 'pin_validated']);
            if ($colis->status !== $validated['status']) {
                $colis->status = $validated['status'];
                $colis->delivered_at = $validated['status'] === 'delivered' ? now() : null;
                // An administrative override is not proof that the delivery PIN was validated.
                // The immutable status history retains any prior real PIN-delivery event.
                $colis->pin_validated = false;
                $colis->save();
                $colis->statusHistory()->create([
                    'status' => $validated['status'], 'message' => 'Override administratif : '.$validated['reason'],
                    'city' => $request->user()->city, 'updated_by' => $request->user()->id,
                ]);
            }
            $audit->record(
                $request->user(),
                'shipment.status_override',
                $colis,
                $validated['reason'],
                $old,
                $colis->only(['status', 'delivered_at', 'pin_validated'])
            );

            return $colis;
        });

        return new ShipmentResource($colis->load('statusHistory'));
    }

    public function updatePayment(Request $request, int $id, AuditLogger $audit): ShipmentResource
    {
        $validated = $request->validate([
            'payment_status' => ['required', 'in:unpaid,paid,refunded'],
            'payment_method' => ['nullable', 'required_if:payment_status,paid', 'string', 'max:50'],
            'reason' => ['required', 'string', 'min:3', 'max:500'],
        ]);
        $colis = DB::transaction(function () use ($request, $id, $validated, $audit) {
            $colis = Colis::whereKey($id)->lockForUpdate()->firstOrFail();
            $old = $colis->only(['payment_status', 'payment_method', 'paid_at', 'is_paid']);
            $paid = $validated['payment_status'] === 'paid';
            $new = [
                'payment_status' => $validated['payment_status'],
                'payment_method' => $validated['payment_method'] ?? null,
                'paid_at' => $paid ? ($colis->paid_at ?? now()) : null,
                'is_paid' => $paid,
            ];
            if (
                $colis->payment_status === $new['payment_status']
                && $colis->payment_method === $new['payment_method']
                && (bool) $colis->is_paid === $new['is_paid']
            ) {
                return $colis;
            }
            $colis->update($new);
            $audit->record($request->user(), 'shipment.payment_updated', $colis, $validated['reason'], $old, $new);

            return $colis;
        });

        return new ShipmentResource($colis);
    }

    private function validateFilters(Request $request, array $extra = []): array
    {
        return $request->validate(array_merge([
            'search' => ['nullable', 'string', 'max:100'],
            'city' => ['nullable', Rule::in(config('logistics.cities'))],
            'page' => ['nullable', 'integer', 'min:1'],
            'per_page' => ['nullable', 'integer', 'min:1', 'max:100'],
        ], $extra));
    }

    private function revokeSessions(User $user): void
    {
        $user->tokens()->delete();
        if (config('session.driver') === 'database') {
            DB::table(config('session.table', 'sessions'))->where('user_id', $user->id)->delete();
        }
    }
}
