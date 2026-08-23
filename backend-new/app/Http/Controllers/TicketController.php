<?php

namespace App\Http\Controllers;

use App\Http\Resources\TicketResource;
use App\Models\Colis;
use App\Models\Notification;
use App\Models\Ticket;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Gate;

class TicketController extends Controller
{
    public function index(Request $request)
    {
        $request->validate(['page' => ['nullable', 'integer', 'min:1'], 'per_page' => ['nullable', 'integer', 'min:1', 'max:100']]);
        $query = Ticket::with('responses');
        if ($request->user()->role !== 'admin') {
            $query->where('user_id', $request->user()->id);
        }

        return TicketResource::collection($query->latest()->paginate($request->integer('per_page', 20)));
    }

    public function store(Request $request)
    {
        $validated = $request->validate([
            'subject' => ['required', 'string', 'max:255'],
            'message' => ['required', 'string', 'max:5000'],
            'colis_id' => ['nullable', 'integer', 'exists:colis,id'],
            'priority' => ['sometimes', 'required', 'in:low,medium,high,urgent'],
        ]);
        $user = $request->user();
        if (! empty($validated['colis_id'])) {
            Gate::forUser($user)->authorize('view', Colis::findOrFail($validated['colis_id']));
        }
        $ticket = Ticket::create([
            'user_id' => $user->id, 'colis_id' => $validated['colis_id'] ?? null,
            'subject' => $validated['subject'], 'message' => $validated['message'],
            'status' => 'open', 'priority' => $validated['priority'] ?? 'medium',
        ]);
        Notification::create([
            'user_id' => $user->id, 'title' => 'Ticket créé',
            'message' => "Votre ticket « {$ticket->subject} » a été soumis.", 'type' => 'info',
        ]);

        return (new TicketResource($ticket->load('responses')))->response()->setStatusCode(201);
    }

    public function respond(Request $request, int $id): TicketResource
    {
        $validated = $request->validate(['message' => ['required', 'string', 'max:5000']]);
        $ticket = Ticket::findOrFail($id);
        Gate::forUser($request->user())->authorize('respond', $ticket);
        $ticket->responses()->create([
            'user_id' => $request->user()->id, 'user_name' => $request->user()->name, 'message' => $validated['message'],
        ]);
        $ticket->touch();

        return new TicketResource($ticket->load('responses'));
    }
}
