<?php

namespace Tests\Feature;

use App\Models\AuditLog;
use App\Models\Colis;
use App\Models\Ticket;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Hash;
use Illuminate\Support\Str;
use Laravel\Sanctum\Sanctum;
use Tests\TestCase;

class ProductionHardeningTest extends TestCase
{
    use RefreshDatabase;

    public function test_login_uses_a_session_and_never_returns_a_bearer_token(): void
    {
        $user = User::factory()->create(['email' => 'session@example.test', 'password' => Hash::make('Password1234')]);

        $response = $this->withHeader('Origin', 'http://localhost:5173')->postJson('/api/auth/login', [
            'email' => strtoupper($user->email), 'password' => 'Password1234',
        ]);

        $response->assertOk()->assertJsonPath('user.id', $user->id)->assertJsonMissingPath('token');
        $this->assertAuthenticatedAs($user, 'web');
    }

    public function test_logout_invalidates_the_authenticated_session(): void
    {
        $user = User::factory()->create(['email' => 'logout@example.test', 'password' => Hash::make('Password1234')]);

        $this->withHeader('Origin', 'http://localhost:5173')->postJson('/api/auth/login', [
            'email' => $user->email, 'password' => 'Password1234',
        ])->assertOk();
        $this->postJson('/api/auth/logout')->assertOk();

        $this->assertGuest('web');
    }

    public function test_credentialed_cors_configuration_never_uses_a_wildcard_origin(): void
    {
        $this->assertTrue(config('cors.supports_credentials'));
        $this->assertNotContains('*', config('cors.allowed_origins'));
        $this->assertContains('sanctum/csrf-cookie', config('cors.paths'));
    }

    public function test_quote_and_creation_price_are_authoritative_on_the_server(): void
    {
        Sanctum::actingAs(User::factory()->create());
        $this->postJson('/api/colis/quote', ['from_city' => 'Casablanca', 'to_city' => 'Rabat', 'weight' => '1.5'])
            ->assertOk()->assertJsonPath('amount', '67.50')->assertJsonPath('currency', 'MAD');

        foreach ([0, 1, -10, 999999] as $price) {
            $this->postJson('/api/colis', [...$this->payload(), 'price' => $price])
                ->assertUnprocessable()->assertJsonValidationErrors('price');
        }
        $this->assertDatabaseCount('colis', 0);
    }

    public function test_creation_is_idempotent_and_uses_decimal_server_price(): void
    {
        Sanctum::actingAs(User::factory()->create());
        $id = (string) Str::uuid();

        $this->postJson('/api/colis', [...$this->payload(), 'client_request_id' => $id])
            ->assertCreated()->assertJsonPath('price', '67.50')->assertJsonPath('idempotent_replay', false);
        $this->postJson('/api/colis', [...$this->payload(), 'client_request_id' => $id])
            ->assertOk()->assertJsonPath('idempotent_replay', true)->assertJsonMissingPath('pin_code');

        $this->assertDatabaseCount('colis', 1);
    }

    public function test_recipient_access_requires_a_linked_verified_phone(): void
    {
        $sender = User::factory()->create();
        $recipient = User::factory()->create(['role' => 'destinataire', 'phone' => '0611223344', 'phone_verified_at' => null]);
        Sanctum::actingAs($sender);
        $first = $this->postJson('/api/colis', [...$this->payload(), 'recipient_phone' => $recipient->phone])->assertCreated();
        $this->assertNull(Colis::findOrFail($first->json('id'))->destinataire_id);

        Sanctum::actingAs($recipient);
        $this->getJson('/api/colis')->assertOk()->assertJsonCount(0, 'data');

        $recipient->update(['phone_verified_at' => now()]);
        Sanctum::actingAs($sender);
        $second = $this->postJson('/api/colis', [...$this->payload(), 'recipient_phone' => $recipient->phone])->assertCreated();
        $this->assertSame($recipient->id, Colis::findOrFail($second->json('id'))->destinataire_id);
    }

    public function test_traveler_claim_requires_a_matching_server_side_trip(): void
    {
        $traveler = User::factory()->create([
            'role' => 'voyageur', 'is_verified' => true, 'verification_status' => 'approved', 'is_online' => true,
        ]);
        $shipment = $this->shipment(['is_voyageur_eligible' => true]);
        Sanctum::actingAs($traveler);

        $this->patchJson("/api/colis/{$shipment->id}/status", ['status' => 'picked_up'])->assertForbidden();
        $trip = $this->postJson('/api/traveler-trips', [
            'from_city' => 'Casablanca', 'to_city' => 'Rabat', 'departure_date' => today()->toDateString(),
        ])->assertCreated();
        $this->patchJson("/api/colis/{$shipment->id}/status", [
            'status' => 'picked_up', 'trip_id' => $trip->json('id'),
        ])->assertOk();

        $this->assertSame($traveler->id, $shipment->fresh()->voyageur_id);
    }

    public function test_traveler_cannot_claim_with_a_trip_for_another_route(): void
    {
        $traveler = User::factory()->create([
            'role' => 'voyageur', 'is_verified' => true, 'verification_status' => 'approved',
        ]);
        $shipment = $this->shipment(['is_voyageur_eligible' => true]);
        Sanctum::actingAs($traveler);
        $trip = $this->postJson('/api/traveler-trips', [
            'from_city' => 'Casablanca', 'to_city' => 'Marrakech', 'departure_date' => today()->toDateString(),
        ])->assertCreated();

        $this->patchJson("/api/colis/{$shipment->id}/status", [
            'status' => 'picked_up', 'trip_id' => $trip->json('id'),
        ])->assertForbidden();
        $this->assertNull($shipment->fresh()->voyageur_id);
    }

    public function test_pin_delivery_is_locked_after_failures_and_never_marks_payment_paid(): void
    {
        $carrier = User::factory()->create(['role' => 'livreur', 'is_verified' => true, 'verification_status' => 'approved']);
        $shipment = $this->shipment(['livreur_id' => $carrier->id, 'status' => 'out_for_delivery']);
        Sanctum::actingAs($carrier);

        $this->patchJson("/api/colis/{$shipment->id}/status", ['status' => 'delivered'])
            ->assertUnprocessable();

        for ($attempt = 0; $attempt < 5; $attempt++) {
            $this->postJson("/api/colis/{$shipment->id}/validate-pin", ['pin' => '9999'])->assertUnprocessable();
        }
        $this->assertSame(5, $shipment->fresh()->pin_attempts);
        $this->assertNotNull($shipment->fresh()->pin_locked_until);
        $this->travel(16)->minutes();
        $this->postJson("/api/colis/{$shipment->id}/validate-pin", ['pin' => '1234'])->assertOk();

        $fresh = $shipment->fresh();
        $this->assertSame('delivered', $fresh->status);
        $this->assertFalse($fresh->is_paid);
        $this->assertSame('unpaid', $fresh->payment_status);
        $this->assertNull($fresh->paid_at);
    }

    public function test_admin_cannot_use_carrier_endpoint_and_override_is_explicitly_audited(): void
    {
        $admin = User::factory()->create(['role' => 'admin']);
        $shipment = $this->shipment(['status' => 'out_for_delivery']);
        Sanctum::actingAs($admin);

        $this->patchJson("/api/colis/{$shipment->id}/status", ['status' => 'delivered'])->assertForbidden();
        $this->patchJson("/api/admin/colis/{$shipment->id}/override-status", [
            'status' => 'delivered', 'reason' => 'Remise confirmée après incident documenté',
        ])->assertOk();

        $this->assertDatabaseHas('audit_logs', [
            'actor_user_id' => $admin->id, 'action' => 'shipment.status_override', 'target_id' => $shipment->id,
        ]);
        $this->assertFalse($shipment->fresh()->is_paid);

        $payment = [
            'payment_status' => 'paid', 'payment_method' => 'cash', 'reason' => 'Paiement encaissé et rapproché',
        ];
        $this->patchJson("/api/admin/colis/{$shipment->id}/payment", $payment)->assertOk();
        $this->patchJson("/api/admin/colis/{$shipment->id}/payment", $payment)->assertOk();
        $this->assertTrue($shipment->fresh()->is_paid);
        $this->assertSame(1, AuditLog::query()->where('action', 'shipment.payment_updated')->count());
    }

    public function test_admin_collections_validate_pagination_and_filters(): void
    {
        $admin = User::factory()->create(['role' => 'admin']);
        User::factory()->create(['role' => 'livreur']);
        User::factory()->create(['role' => 'voyageur']);
        Sanctum::actingAs($admin);

        $this->getJson('/api/admin/users?role=livreur&per_page=1')->assertOk()
            ->assertJsonCount(1, 'data')->assertJsonPath('data.0.role', 'livreur')
            ->assertJsonPath('meta.per_page', 1);
        $this->getJson('/api/admin/users?per_page=101')->assertUnprocessable()
            ->assertJsonValidationErrors('per_page');
        $this->getJson('/api/admin/colis?status=unknown')->assertUnprocessable()
            ->assertJsonValidationErrors('status');
    }

    public function test_admin_moderation_reasons_are_persisted_and_audited(): void
    {
        $admin = User::factory()->create(['role' => 'admin']);
        $courier = User::factory()->create([
            'role' => 'livreur', 'verification_status' => 'pending', 'is_verified' => false,
        ]);
        Sanctum::actingAs($admin);

        $this->patchJson("/api/admin/couriers/{$courier->id}/verify", ['status' => 'rejected'])
            ->assertUnprocessable()->assertJsonValidationErrors('reason');
        $this->patchJson("/api/admin/couriers/{$courier->id}/verify", [
            'status' => 'rejected', 'reason' => 'Informations incohérentes',
        ])->assertOk();
        $this->postJson("/api/admin/couriers/{$courier->id}/warn", [
            'reason' => 'Comportement signalé',
        ])->assertOk();
        $this->patchJson("/api/admin/couriers/{$courier->id}/ban", [
            'reason' => 'Récidive documentée',
        ])->assertOk();

        $fresh = $courier->fresh();
        $this->assertSame('rejected', $fresh->verification_status);
        $this->assertSame('Informations incohérentes', $fresh->verification_reason);
        $this->assertSame($admin->id, $fresh->verified_by);
        $this->assertTrue($fresh->is_banned);
        $this->assertSame(3, AuditLog::query()->where('target_id', $courier->id)->count());
    }

    public function test_admin_rejection_and_fourth_warning_take_carriers_offline(): void
    {
        $admin = User::factory()->create(['role' => 'admin']);
        $rejected = User::factory()->create([
            'role' => 'livreur', 'verification_status' => 'approved', 'is_verified' => true, 'is_online' => true,
        ]);
        $warned = User::factory()->create([
            'role' => 'voyageur', 'verification_status' => 'approved', 'is_verified' => true,
            'is_online' => true, 'warnings' => 3,
        ]);
        Sanctum::actingAs($admin);

        $this->patchJson("/api/admin/couriers/{$rejected->id}/verify", [
            'status' => 'rejected', 'reason' => 'Documents non conformes',
        ])->assertOk();
        $this->postJson("/api/admin/couriers/{$warned->id}/warn", [
            'reason' => 'Quatrième incident documenté',
        ])->assertOk();

        $this->assertFalse($rejected->fresh()->is_online);
        $this->assertFalse($warned->fresh()->is_online);
        $this->assertTrue($warned->fresh()->is_banned);
        $this->assertDatabaseHas('notifications', ['user_id' => $rejected->id, 'type' => 'error']);
        $this->assertDatabaseHas('notifications', ['user_id' => $warned->id, 'type' => 'warning']);
    }

    public function test_admin_ticket_response_is_atomic_notified_and_audited(): void
    {
        $admin = User::factory()->create(['role' => 'admin']);
        $owner = User::factory()->create(['role' => 'expediteur']);
        $ticket = Ticket::create([
            'user_id' => $owner->id, 'subject' => 'Colis bloqué', 'message' => 'Besoin d’aide',
            'status' => 'open', 'priority' => 'high',
        ]);
        Sanctum::actingAs($admin);

        $this->patchJson("/api/admin/tickets/{$ticket->id}", [
            'status' => 'resolved', 'response' => 'Le dossier a été corrigé.',
        ])->assertOk()->assertJsonPath('status', 'resolved')
            ->assertJsonPath('responses.0.user_name', $admin->name);

        $this->assertDatabaseHas('notifications', ['user_id' => $owner->id, 'type' => 'info']);
        $this->assertDatabaseHas('audit_logs', [
            'actor_user_id' => $admin->id, 'action' => 'ticket.updated', 'target_id' => $ticket->id,
        ]);
        $this->patchJson("/api/admin/tickets/{$ticket->id}", [])->assertUnprocessable();
    }

    public function test_duplicate_rating_returns_conflict_and_keeps_one_aggregate(): void
    {
        $carrier = User::factory()->create(['role' => 'livreur']);
        $recipient = User::factory()->create(['role' => 'destinataire']);
        $shipment = $this->shipment([
            'livreur_id' => $carrier->id, 'destinataire_id' => $recipient->id, 'status' => 'delivered',
        ]);
        Sanctum::actingAs($recipient);
        $rating = ['to_user_id' => $carrier->id, 'score' => 4, 'comment' => 'Livraison correcte'];

        $this->postJson("/api/colis/{$shipment->id}/rate", $rating)->assertCreated();
        $this->postJson("/api/colis/{$shipment->id}/rate", $rating)->assertConflict();
        $this->assertDatabaseCount('ratings', 1);
        $this->assertSame(1, $carrier->fresh()->rating_count);
    }

    private function payload(): array
    {
        return [
            'from_address' => '1 rue A', 'to_address' => '2 rue B',
            'from_city' => 'Casablanca', 'to_city' => 'Rabat',
            'recipient_name' => 'Destinataire', 'recipient_phone' => '0699999999',
            'weight' => '1.5',
        ];
    }

    private function shipment(array $overrides = []): Colis
    {
        return Colis::create(array_merge([
            'tracking_id' => 'LOG'.strtoupper(Str::random(12)), 'expediteur_id' => User::factory()->create()->id,
            'status' => 'pending', 'from_city' => 'Casablanca', 'to_city' => 'Rabat',
            'from_address' => '1 rue A', 'to_address' => '2 rue B', 'recipient_name' => 'Destinataire',
            'recipient_phone' => '0699999999', 'weight' => 1, 'price' => '65.00', 'pin_code' => Hash::make('1234'),
        ], $overrides));
    }
}
