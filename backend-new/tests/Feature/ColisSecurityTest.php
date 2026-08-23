<?php

namespace Tests\Feature;

use App\Models\Colis;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Hash;
use Laravel\Sanctum\Sanctum;
use Tests\TestCase;

class ColisSecurityTest extends TestCase
{
    use RefreshDatabase;

    public function test_creation_returns_plain_pin_once_while_storing_only_its_hash(): void
    {
        Sanctum::actingAs($this->user('expediteur'));

        $response = $this->postJson('/api/colis', $this->shipmentPayload());

        $response->assertCreated()->assertJsonPath('status', 'pending');
        $pin = $response->json('pin_code');

        $this->assertMatchesRegularExpression('/^\d{4}$/', $pin);
        $storedPin = Colis::firstOrFail()->getRawOriginal('pin_code');
        $this->assertNotSame($pin, $storedPin);
        $this->assertTrue(Hash::check($pin, $storedPin));
    }

    public function test_public_tracking_never_exposes_the_pin_hash(): void
    {
        $colis = $this->colis();

        $this->getJson("/api/colis/track/{$colis->tracking_id}")
            ->assertOk()
            ->assertJsonMissingPath('pin_code');
    }

    public function test_public_tracking_does_not_expose_personal_contact_or_address_data(): void
    {
        $colis = $this->colis();

        $this->getJson("/api/colis/track/{$colis->tracking_id}")
            ->assertOk()
            ->assertJsonMissingPath('recipient_name')
            ->assertJsonMissingPath('recipient_phone')
            ->assertJsonMissingPath('from_address')
            ->assertJsonMissingPath('to_address')
            ->assertJsonMissingPath('expediteur');
    }

    public function test_malformed_tracking_identifier_is_rejected_by_the_route(): void
    {
        $this->getJson('/api/colis/track/not-valid!')->assertNotFound();
    }

    public function test_unassigned_user_cannot_change_a_shipment_status(): void
    {
        $colis = $this->colis();
        Sanctum::actingAs($this->user('destinataire', '0611111111'));

        $this->patchJson("/api/colis/{$colis->id}/status", ['status' => 'delivered'])
            ->assertForbidden();

        $this->assertSame('pending', $colis->fresh()->status);
    }

    public function test_unassigned_carrier_cannot_validate_a_shipment_pin(): void
    {
        $colis = $this->colis();
        Sanctum::actingAs($this->user('livreur'));

        $this->postJson("/api/colis/{$colis->id}/validate-pin", ['pin' => '1234'])
            ->assertForbidden();

        $this->assertFalse($colis->fresh()->pin_validated);
    }

    public function test_assigned_carrier_can_validate_the_pin_without_exposing_its_hash(): void
    {
        $carrier = $this->user('livreur');
        $colis = $this->colis(['livreur_id' => $carrier->id, 'status' => 'out_for_delivery']);
        Sanctum::actingAs($carrier);

        $this->postJson("/api/colis/{$colis->id}/validate-pin", ['pin' => '1234'])
            ->assertOk()
            ->assertJsonPath('success', true)
            ->assertJsonMissingPath('colis.pin_code');

        $this->assertTrue($colis->fresh()->pin_validated);
        $this->assertSame('delivered', $colis->fresh()->status);
    }

    public function test_pin_validation_retry_is_idempotent(): void
    {
        $carrier = $this->user('livreur');
        $colis = $this->colis(['livreur_id' => $carrier->id, 'status' => 'out_for_delivery']);
        Sanctum::actingAs($carrier);

        $this->postJson("/api/colis/{$colis->id}/validate-pin", ['pin' => '1234'])->assertOk();
        $this->postJson("/api/colis/{$colis->id}/validate-pin", ['pin' => '1234'])->assertOk();

        $this->assertDatabaseCount('status_histories', 1);
    }

    public function test_only_one_carrier_can_claim_a_pending_shipment(): void
    {
        $firstCarrier = $this->user('livreur');
        $secondCarrier = $this->user('livreur');
        $colis = $this->colis();

        Sanctum::actingAs($firstCarrier);
        $this->patchJson("/api/colis/{$colis->id}/status", ['status' => 'picked_up'])->assertOk();

        Sanctum::actingAs($secondCarrier);
        $this->patchJson("/api/colis/{$colis->id}/status", ['status' => 'picked_up'])->assertForbidden();

        $this->assertSame($firstCarrier->id, $colis->fresh()->livreur_id);
        $this->assertDatabaseCount('status_histories', 1);
    }

    public function test_unverified_carrier_cannot_view_or_claim_available_shipments(): void
    {
        $carrier = $this->user('livreur');
        $carrier->update(['is_verified' => false, 'verification_status' => 'pending']);
        $colis = $this->colis();
        Sanctum::actingAs($carrier);

        $this->getJson('/api/colis?status=available')->assertForbidden();
        $this->patchJson("/api/colis/{$colis->id}/status", ['status' => 'picked_up'])->assertForbidden();

        $this->assertNull($colis->fresh()->livreur_id);
    }

    public function test_available_shipments_hide_recipient_and_exact_addresses_until_claimed(): void
    {
        $carrier = $this->user('livreur');
        $this->colis();
        Sanctum::actingAs($carrier);

        $this->getJson('/api/colis?status=available')
            ->assertOk()
            ->assertJsonCount(1, 'data')
            ->assertJsonMissingPath('data.0.recipient_name')
            ->assertJsonMissingPath('data.0.recipient_phone')
            ->assertJsonMissingPath('data.0.from_address')
            ->assertJsonMissingPath('data.0.to_address');
    }

    public function test_carrier_cannot_skip_or_reverse_shipment_statuses(): void
    {
        $carrier = $this->user('livreur');
        $colis = $this->colis(['livreur_id' => $carrier->id, 'status' => 'picked_up']);
        Sanctum::actingAs($carrier);

        $this->patchJson("/api/colis/{$colis->id}/status", ['status' => 'delivered'])
            ->assertUnprocessable();
        $this->patchJson("/api/colis/{$colis->id}/status", ['status' => 'pending'])
            ->assertUnprocessable();

        $this->assertSame('picked_up', $colis->fresh()->status);
    }

    public function test_general_status_endpoint_cannot_bypass_the_delivery_pin(): void
    {
        $carrier = $this->user('livreur');
        $colis = $this->colis(['livreur_id' => $carrier->id, 'status' => 'in_transit']);
        Sanctum::actingAs($carrier);

        $this->patchJson("/api/colis/{$colis->id}/status", ['status' => 'delivered'])->assertUnprocessable();

        $this->assertSame('in_transit', $colis->fresh()->status);
        $this->assertDatabaseCount('status_histories', 0);
        $this->assertDatabaseCount('notifications', 0);
    }

    public function test_unrelated_user_cannot_rate_a_carrier_for_someone_elses_shipment(): void
    {
        $carrier = $this->user('livreur');
        $colis = $this->colis(['livreur_id' => $carrier->id, 'status' => 'delivered']);
        Sanctum::actingAs($this->user('destinataire', '0699999999'));

        $this->postJson("/api/colis/{$colis->id}/rate", [
            'to_user_id' => $carrier->id,
            'score' => 5,
        ])->assertForbidden();

        $this->assertDatabaseCount('ratings', 0);
    }

    public function test_recipient_can_rate_only_the_assigned_carrier_after_delivery(): void
    {
        $carrier = $this->user('livreur');
        $otherCarrier = $this->user('livreur');
        $recipient = $this->user('destinataire', '0611111111');
        $colis = $this->colis(['livreur_id' => $carrier->id, 'destinataire_id' => $recipient->id, 'status' => 'delivered']);
        Sanctum::actingAs($recipient);

        $this->postJson("/api/colis/{$colis->id}/rate", [
            'to_user_id' => $otherCarrier->id,
            'score' => 5,
        ])->assertUnprocessable();

        $this->postJson("/api/colis/{$colis->id}/rate", [
            'to_user_id' => $carrier->id,
            'score' => 5,
            'comment' => 'Livraison réussie',
        ])->assertCreated()->assertJsonPath('score', 5);

        $this->assertDatabaseHas('ratings', [
            'colis_id' => $colis->id,
            'to_user_id' => $carrier->id,
            'score' => 5,
        ]);
    }

    private function user(string $role, ?string $phone = null): User
    {
        return User::create([
            'name' => ucfirst($role),
            'email' => uniqid($role.'-', true).'@example.test',
            'phone' => $phone ?? '06'.random_int(10000000, 99999999),
            'password' => Hash::make('password'),
            'role' => $role,
            'city' => 'Casablanca',
            'verification_status' => 'approved',
            'is_verified' => true,
            'is_online' => in_array($role, ['livreur', 'voyageur'], true),
        ]);
    }

    private function colis(array $overrides = []): Colis
    {
        return Colis::create(array_merge([
            'tracking_id' => 'LOGTEST001',
            'expediteur_id' => $this->user('expediteur')->id,
            'status' => 'pending',
            'from_city' => 'Casablanca',
            'to_city' => 'Rabat',
            'from_address' => 'Adresse de départ',
            'to_address' => 'Adresse de destination',
            'recipient_name' => 'Destinataire',
            'recipient_phone' => '0611111111',
            'weight' => 1.5,
            'price' => 50,
            'pin_code' => Hash::make('1234'),
        ], $overrides));
    }

    private function shipmentPayload(): array
    {
        return [
            'from_address' => 'Adresse de départ',
            'to_address' => 'Adresse de destination',
            'from_city' => 'Casablanca',
            'to_city' => 'Rabat',
            'recipient_name' => 'Destinataire',
            'recipient_phone' => '0611111111',
            'weight' => 1.5,
        ];
    }
}
