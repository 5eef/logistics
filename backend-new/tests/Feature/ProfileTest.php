<?php

namespace Tests\Feature;

use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Http\UploadedFile;
use Illuminate\Support\Facades\Storage;
use Tests\TestCase;

class ProfileTest extends TestCase
{
    use RefreshDatabase;

    public function test_an_authenticated_user_can_update_safe_profile_fields(): void
    {
        $user = User::factory()->create(['phone' => '0612345678']);

        $this->actingAs($user, 'sanctum')
            ->patchJson('/api/profile', [
                'name' => 'Nouveau nom',
                'phone' => '0698765432',
                'city' => 'Rabat',
            ])
            ->assertOk()
            ->assertJsonPath('name', 'Nouveau nom')
            ->assertJsonPath('city', 'Rabat');

        $this->assertDatabaseHas('users', ['id' => $user->id, 'phone' => '+212698765432']);
        $this->assertDatabaseHas('notifications', [
            'user_id' => $user->id,
            'title' => 'Profil mis à jour',
            'type' => 'success',
        ]);
    }

    public function test_an_authenticated_user_can_upload_an_avatar(): void
    {
        Storage::fake('public');
        $user = User::factory()->create();

        $response = $this->actingAs($user, 'sanctum')
            ->post('/api/profile/avatar', [
                'avatar' => UploadedFile::fake()->createWithContent(
                    'avatar.png',
                    base64_decode('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVQIW2Nk+M/wHwAF/gL+P1RGvQAAAABJRU5ErkJggg==')
                ),
            ])
            ->assertOk()
            ->assertJsonPath('name', $user->name);

        $this->assertNotNull($response->json('avatar_url'));
        Storage::disk('public')->assertExists($user->fresh()->avatar_path);
    }
}
