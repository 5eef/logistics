<?php

namespace Tests\Feature;

use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

class AdminSecurityTest extends TestCase
{
    use RefreshDatabase;

    public function test_banning_a_carrier_revokes_all_existing_tokens(): void
    {
        $admin = User::factory()->create(['role' => 'admin']);
        $carrier = User::factory()->create(['role' => 'livreur']);
        $adminToken = $admin->createToken('admin')->plainTextToken;
        $carrier->createToken('phone');
        $carrier->createToken('laptop');

        $this->withToken($adminToken)
            ->patchJson("/api/admin/couriers/{$carrier->id}/ban", ['reason' => 'Violation grave et documentée'])
            ->assertOk()
            ->assertJsonPath('is_banned', true);

        $this->assertDatabaseMissing('personal_access_tokens', [
            'tokenable_type' => User::class,
            'tokenable_id' => $carrier->id,
        ]);
    }

    public function test_courier_moderation_endpoints_reject_non_carrier_targets(): void
    {
        $admin = User::factory()->create(['role' => 'admin']);
        $sender = User::factory()->create(['role' => 'expediteur']);

        $adminToken = $admin->createToken('admin')->plainTextToken;
        $this->withToken($adminToken)
            ->patchJson("/api/admin/couriers/{$sender->id}/ban", ['reason' => 'Test de cible non transporteur'])
            ->assertNotFound();

        $this->assertFalse($sender->fresh()->is_banned);
    }
}
