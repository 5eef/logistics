<?php

namespace Tests\Feature;

use App\Models\Colis;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Hash;
use Laravel\Sanctum\Sanctum;
use Tests\TestCase;

class ShipmentAuthorizationTest extends TestCase
{
    use RefreshDatabase;

    public function test_public_tracking_does_not_expose_personal_data_or_the_pin(): void
    {
        $sender = User::factory()->create();
        $colis = $this->colis($sender, ['tracking_id' => 'LOGPUBLIC1']);

        $response = $this->getJson('/api/colis/track/LOGPUBLIC1');

        $response->assertOk()
            ->assertJsonPath('tracking_id', $colis->tracking_id)
            ->assertJsonMissingPath('from_address')
            ->assertJsonMissingPath('to_address')
            ->assertJsonMissingPath('recipient_phone')
            ->assertJsonMissingPath('pin_code');
    }

    public function test_only_the_assigned_verified_delivery_user_can_confirm_the_pin(): void
    {
        $sender = User::factory()->create();
        $courier = User::factory()->create([
            'role' => 'livreur',
            'is_verified' => true,
            'verification_status' => 'approved',
        ]);
        $otherUser = User::factory()->create();
        $colis = $this->colis($sender, [
            'status' => 'out_for_delivery',
            'livreur_id' => $courier->id,
            'pin_code' => Hash::make('1234'),
        ]);

        Sanctum::actingAs($otherUser);
        $this->postJson("/api/colis/{$colis->id}/validate-pin", ['pin' => '1234'])->assertForbidden();

        Sanctum::actingAs($courier);
        $this->postJson("/api/colis/{$colis->id}/validate-pin", ['pin' => '1234'])
            ->assertOk()
            ->assertJsonPath('success', true);

        $this->assertDatabaseHas('colis', ['id' => $colis->id, 'status' => 'delivered', 'pin_validated' => true]);
    }

    public function test_sender_cannot_change_a_delivery_status(): void
    {
        $sender = User::factory()->create();
        $colis = $this->colis($sender);

        Sanctum::actingAs($sender);
        $this->patchJson("/api/colis/{$colis->id}/status", ['status' => 'picked_up'])->assertForbidden();
    }

    private function colis(User $sender, array $overrides = []): Colis
    {
        return Colis::create(array_merge([
            'tracking_id' => 'LOG'.str()->upper(str()->random(7)),
            'expediteur_id' => $sender->id,
            'status' => 'pending',
            'from_city' => 'Casablanca',
            'to_city' => 'Rabat',
            'from_address' => '1 rue A',
            'to_address' => '2 rue B',
            'recipient_name' => 'Destinataire',
            'recipient_phone' => '0699999999',
            'weight' => 1,
            'price' => 20,
            'pin_code' => Hash::make('1234'),
        ], $overrides));
    }
}
