<?php

namespace Tests\Feature;

use App\Contracts\PhoneVerificationProvider;
use App\Models\Colis;
use App\Models\User;
use App\Services\FailClosedPhoneVerificationProvider;
use App\Services\PhoneNormalizer;
use Illuminate\Auth\Notifications\ResetPassword as ResetPasswordNotification;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Hash;
use Illuminate\Support\Facades\Log;
use Illuminate\Support\Facades\Notification;
use Illuminate\Support\Facades\Password;
use Illuminate\Support\Str;
use Laravel\Sanctum\Sanctum;
use Tests\TestCase;

class FinalCounterAuditTest extends TestCase
{
    use RefreshDatabase;

    public function test_password_reset_notification_targets_the_spa_and_unknown_accounts_are_indistinguishable(): void
    {
        Notification::fake();
        config(['logistics.frontend_url' => 'https://spa.example.test']);
        $user = User::factory()->create(['email' => 'reset@example.test']);

        $existing = $this->postJson('/api/auth/forgot-password', ['email' => 'RESET@example.test'])->assertOk();
        $missing = $this->postJson('/api/auth/forgot-password', ['email' => 'missing@example.test'])->assertOk();
        $this->assertSame($existing->json(), $missing->json());

        Notification::assertSentTo($user, ResetPasswordNotification::class, function ($notification) use ($user) {
            $url = $notification->toMail($user)->actionUrl;

            return str_starts_with($url, 'https://spa.example.test/reset-password?')
                && str_contains($url, 'token=')
                && str_contains($url, 'email=reset%40example.test');
        });
    }

    public function test_valid_password_reset_changes_password_and_revokes_tokens_and_database_sessions_without_logging_secrets(): void
    {
        $user = User::factory()->create(['email' => 'change@example.test', 'password' => Hash::make('OldPassword123')]);
        $user->createToken('old-session');
        DB::table('sessions')->insert([
            'id' => 'old-session-id', 'user_id' => $user->id, 'payload' => 'opaque', 'last_activity' => now()->timestamp,
        ]);
        config(['session.driver' => 'database']);
        $token = Password::createToken($user);
        Log::spy();

        $this->postJson('/api/auth/reset-password', [
            'token' => $token,
            'email' => strtoupper($user->email),
            'password' => 'NewPassword123',
            'password_confirmation' => 'NewPassword123',
        ])->assertOk();

        $this->assertTrue(Hash::check('NewPassword123', $user->fresh()->password));
        $this->assertDatabaseMissing('personal_access_tokens', ['tokenable_id' => $user->id]);
        $this->assertDatabaseMissing('sessions', ['user_id' => $user->id]);
        Log::shouldNotHaveReceived('debug');
        Log::shouldNotHaveReceived('info');
        Log::shouldNotHaveReceived('warning');
        Log::shouldNotHaveReceived('error');
    }

    public function test_invalid_and_expired_password_reset_tokens_are_rejected(): void
    {
        $user = User::factory()->create(['email' => 'expired@example.test', 'password' => Hash::make('OldPassword123')]);
        $payload = [
            'email' => $user->email,
            'password' => 'NewPassword123',
            'password_confirmation' => 'NewPassword123',
        ];

        $this->postJson('/api/auth/reset-password', [...$payload, 'token' => 'invalid'])->assertUnprocessable();
        $token = Password::createToken($user);
        DB::table('password_reset_tokens')->where('email', $user->email)->update(['created_at' => now()->subMinutes(61)]);
        $this->postJson('/api/auth/reset-password', [...$payload, 'token' => $token])->assertUnprocessable();
        $this->assertTrue(Hash::check('OldPassword123', $user->fresh()->password));
    }

    public function test_phone_verification_calls_provider_rejects_wrong_code_and_links_matching_shipments(): void
    {
        config(['logistics.phone_verification.enabled' => true]);
        $recipient = User::factory()->create([
            'role' => 'destinataire', 'phone' => '0612345678', 'phone_verified_at' => null,
        ]);
        $shipment = $this->shipment(['recipient_phone' => '00212612345678', 'destinataire_id' => null]);
        Sanctum::actingAs($recipient);

        $this->postJson('/api/auth/phone-verification/start')->assertOk();
        $this->postJson('/api/auth/phone-verification/confirm', ['code' => '000000'])->assertUnprocessable();
        $this->postJson('/api/auth/phone-verification/confirm', ['code' => '123456'])
            ->assertOk()->assertJsonPath('linked_shipments', 1);

        $this->assertNotNull($recipient->fresh()->phone_verified_at);
        $this->assertSame($recipient->id, $shipment->fresh()->destinataire_id);
    }

    public function test_phone_verification_is_rate_limited_and_fails_closed_without_a_provider(): void
    {
        config(['logistics.phone_verification.enabled' => true]);
        $user = User::factory()->create(['phone_verified_at' => null]);
        Sanctum::actingAs($user);

        for ($attempt = 0; $attempt < 5; $attempt++) {
            $this->postJson('/api/auth/phone-verification/start')->assertOk();
        }
        $this->postJson('/api/auth/phone-verification/start')->assertTooManyRequests();

        $other = User::factory()->create(['phone_verified_at' => null]);
        Sanctum::actingAs($other);
        $this->app->bind(PhoneVerificationProvider::class, FailClosedPhoneVerificationProvider::class);
        $this->postJson('/api/auth/phone-verification/start')->assertServiceUnavailable();
    }

    public function test_phone_change_revokes_verification_and_unverified_recipient_has_no_shipment_access(): void
    {
        $recipient = User::factory()->create(['role' => 'destinataire', 'phone_verified_at' => now()]);
        $shipment = $this->shipment(['destinataire_id' => null, 'recipient_phone' => '0611111111']);
        Sanctum::actingAs($recipient);

        $this->patchJson('/api/profile', [
            'name' => $recipient->name, 'phone' => '0712345678', 'city' => $recipient->city,
        ])->assertOk();
        $this->assertNull($recipient->fresh()->phone_verified_at);
        $this->getJson('/api/colis')->assertOk()->assertJsonCount(0, 'data');
        $this->assertNull($shipment->fresh()->destinataire_id);
    }

    public function test_equivalent_moroccan_phone_formats_have_one_canonical_value(): void
    {
        foreach (['0612345678', '+212612345678', '00212612345678', '06 12 34 56 78'] as $format) {
            $this->assertSame('+212612345678', PhoneNormalizer::normalize($format));
            $this->assertTrue(PhoneNormalizer::isSupportedMoroccanNumber($format));
        }
        $this->assertFalse(PhoneNormalizer::isSupportedMoroccanNumber('+33123456789'));
    }

    public function test_phone_backfill_canonicalizes_existing_accounts_and_shipments_without_merging(): void
    {
        $userId = DB::table('users')->insertGetId($this->rawUser(['phone' => '06 12 34 56 78']));
        $shipmentId = DB::table('colis')->insertGetId($this->shipmentAttributes([
            'expediteur_id' => $userId, 'recipient_phone' => '00212698765432',
        ]));
        $migration = require database_path('migrations/2026_08_23_000004_canonicalize_moroccan_phone_numbers.php');

        $migration->up();

        $this->assertDatabaseHas('users', ['id' => $userId, 'phone' => '+212612345678']);
        $this->assertDatabaseHas('colis', ['id' => $shipmentId, 'recipient_phone' => '+212698765432']);
    }

    public function test_phone_backfill_aborts_and_reports_ids_before_a_canonical_collision(): void
    {
        $firstId = DB::table('users')->insertGetId($this->rawUser(['email' => 'first@example.test', 'phone' => '0612345678']));
        $secondId = DB::table('users')->insertGetId($this->rawUser(['email' => 'second@example.test', 'phone' => '+212612345678']));
        $migration = require database_path('migrations/2026_08_23_000004_canonicalize_moroccan_phone_numbers.php');

        try {
            $migration->up();
            $this->fail('The migration should stop before updating colliding accounts.');
        } catch (\RuntimeException $exception) {
            $this->assertStringContainsString("users={$firstId},{$secondId}", $exception->getMessage());
        }

        $this->assertDatabaseHas('users', ['id' => $firstId, 'phone' => '0612345678']);
        $this->assertDatabaseHas('users', ['id' => $secondId, 'phone' => '+212612345678']);
    }

    public function test_database_idempotency_collision_is_recovered_as_a_replay(): void
    {
        $sender = User::factory()->create();
        Sanctum::actingAs($sender);
        $requestId = (string) Str::uuid();
        $inserted = false;
        DB::listen(function ($query) use (&$inserted, $sender, $requestId) {
            if ($inserted || ! str_contains(strtolower($query->sql), 'client_request_id')) {
                return;
            }
            $inserted = true;
            DB::table('colis')->insert($this->shipmentAttributes([
                'tracking_id' => 'LOGCOLLISION01',
                'expediteur_id' => $sender->id,
                'client_request_id' => $requestId,
            ]));
        });

        $this->postJson('/api/colis', [...$this->shipmentPayload(), 'client_request_id' => $requestId])
            ->assertOk()
            ->assertJsonPath('tracking_id', 'LOGCOLLISION01')
            ->assertJsonPath('idempotent_replay', true)
            ->assertJsonMissingPath('pin_code');
        $this->assertDatabaseCount('colis', 1);
    }

    public function test_public_tracking_replaces_internal_free_text_with_a_deterministic_message(): void
    {
        $shipment = $this->shipment();
        $shipment->statusHistory()->create([
            'status' => 'in_transit',
            'message' => 'Appeler le 0612345678 puis aller au 12 rue SecrÃ¨te, Casablanca',
            'city' => 'Casablanca',
        ]);

        $response = $this->getJson('/api/colis/track/'.$shipment->tracking_id)->assertOk();
        $encoded = $response->getContent();
        $this->assertStringNotContainsString('0612345678', $encoded);
        $this->assertStringNotContainsString('rue Secr', $encoded);
        $response->assertJsonPath('status_history.0.message', 'Colis en transit.');
    }

    public function test_admin_status_overrides_keep_delivery_fields_coherent_without_faking_a_pin(): void
    {
        $admin = User::factory()->create(['role' => 'admin']);
        Sanctum::actingAs($admin);
        $reason = 'Correction documentÃ©e par le support';

        $forced = $this->shipment(['status' => 'out_for_delivery']);
        $this->patchJson("/api/admin/colis/{$forced->id}/override-status", ['status' => 'delivered', 'reason' => $reason])->assertOk();
        $this->assertNotNull($forced->fresh()->delivered_at);
        $this->assertFalse($forced->fresh()->pin_validated);

        $real = $this->shipment(['status' => 'delivered', 'pin_validated' => true, 'delivered_at' => now()]);
        $this->patchJson("/api/admin/colis/{$real->id}/override-status", ['status' => 'delivered', 'reason' => $reason])->assertOk();
        $this->assertTrue($real->fresh()->pin_validated);

        $this->patchJson("/api/admin/colis/{$real->id}/override-status", ['status' => 'returned', 'reason' => $reason])->assertOk();
        $this->assertNull($real->fresh()->delivered_at);
        $this->assertFalse($real->fresh()->pin_validated);
        $this->assertDatabaseHas('status_histories', ['colis_id' => $real->id, 'status' => 'returned']);
    }

    public function test_verified_courier_vehicle_change_resets_approval_and_is_audited(): void
    {
        $courier = User::factory()->create([
            'role' => 'livreur', 'vehicle_type' => 'Moto', 'vehicle_plate' => 'ABC-1',
            'verification_status' => 'approved', 'is_verified' => true, 'verified_at' => now(), 'is_online' => true,
        ]);
        Sanctum::actingAs($courier);

        $this->patchJson('/api/profile', [
            'name' => $courier->name, 'phone' => $courier->phone, 'city' => $courier->city,
            'vehicle_type' => 'Voiture', 'vehicle_plate' => 'XYZ-9',
            'cin' => 'SHOULD-NOT-BE-WRITABLE', 'license_number' => 'SHOULD-NOT-BE-WRITABLE',
        ])->assertOk();

        $fresh = $courier->fresh();
        $this->assertSame('pending', $fresh->verification_status);
        $this->assertFalse($fresh->is_verified);
        $this->assertFalse($fresh->is_online);
        $this->assertNotSame('SHOULD-NOT-BE-WRITABLE', $fresh->cin);
        $this->assertDatabaseHas('audit_logs', ['action' => 'courier.verification_data_changed', 'target_id' => $courier->id]);
    }

    public function test_traveler_trips_are_deduplicated_limited_bounded_and_cancellable(): void
    {
        config(['logistics.traveler_trips.maximum_active' => 2, 'logistics.traveler_trips.maximum_horizon_days' => 90]);
        $traveler = User::factory()->create(['role' => 'voyageur', 'is_verified' => true, 'verification_status' => 'approved']);
        Sanctum::actingAs($traveler);
        $trip = ['from_city' => 'Casablanca', 'to_city' => 'Rabat', 'departure_date' => today()->addDay()->toDateString()];

        $first = $this->postJson('/api/traveler-trips', $trip)->assertCreated()->assertJsonPath('idempotent_replay', false);
        $this->postJson('/api/traveler-trips', $trip)->assertOk()->assertJsonPath('id', $first->json('id'))->assertJsonPath('idempotent_replay', true);
        $this->postJson('/api/traveler-trips', [...$trip, 'to_city' => 'Marrakech'])->assertCreated();
        $this->postJson('/api/traveler-trips', [...$trip, 'to_city' => 'Agadir'])->assertUnprocessable();
        $this->postJson('/api/traveler-trips', [...$trip, 'departure_date' => today()->addDays(91)->toDateString()])->assertUnprocessable();
        $this->getJson('/api/traveler-trips')->assertOk()->assertJsonCount(2);
        $this->patchJson('/api/traveler-trips/'.$first->json('id').'/cancel')->assertOk();
        $this->getJson('/api/traveler-trips')->assertOk()->assertJsonCount(1);
    }

    public function test_admin_pagination_reports_global_totals_for_21_50_and_more_than_100_records(): void
    {
        $admin = User::factory()->create(['role' => 'admin']);
        User::factory()->count(121)->create();
        Sanctum::actingAs($admin);

        $this->getJson('/api/admin/users?per_page=21')->assertOk()->assertJsonCount(21, 'data')->assertJsonPath('meta.total', 121);
        $this->getJson('/api/admin/users?per_page=50')->assertOk()->assertJsonCount(50, 'data')->assertJsonPath('meta.total', 121);
        $this->getJson('/api/admin/users?per_page=50&page=3')->assertOk()->assertJsonCount(21, 'data')->assertJsonPath('meta.current_page', 3);
    }

    public function test_recipient_can_rate_an_assigned_traveler(): void
    {
        $traveler = User::factory()->create(['role' => 'voyageur']);
        $recipient = User::factory()->create(['role' => 'destinataire']);
        $shipment = $this->shipment(['voyageur_id' => $traveler->id, 'destinataire_id' => $recipient->id, 'status' => 'delivered']);
        Sanctum::actingAs($recipient);

        $this->postJson("/api/colis/{$shipment->id}/rate", [
            'to_user_id' => $traveler->id, 'score' => 5, 'comment' => 'Trajet impeccable',
        ])->assertCreated();
        $this->assertSame(1, $traveler->fresh()->rating_count);
    }

    private function shipment(array $overrides = []): Colis
    {
        return Colis::create($this->shipmentAttributes($overrides));
    }

    private function shipmentAttributes(array $overrides = []): array
    {
        return array_merge([
            'tracking_id' => 'LOG'.strtoupper(Str::random(12)),
            'expediteur_id' => User::factory()->create()->id,
            'status' => 'pending',
            'from_city' => 'Casablanca',
            'to_city' => 'Rabat',
            'from_address' => '1 rue A',
            'to_address' => '2 rue B',
            'recipient_name' => 'Destinataire',
            'recipient_phone' => '+212699999999',
            'weight' => 1,
            'price' => '65.00',
            'pin_code' => Hash::make('1234'),
            'created_at' => now(),
            'updated_at' => now(),
        ], $overrides);
    }

    private function shipmentPayload(): array
    {
        return [
            'from_address' => '1 rue A', 'to_address' => '2 rue B',
            'from_city' => 'Casablanca', 'to_city' => 'Rabat',
            'recipient_name' => 'Destinataire', 'recipient_phone' => '0699999999', 'weight' => '1.5',
        ];
    }

    private function rawUser(array $overrides = []): array
    {
        return array_merge([
            'name' => 'Legacy User',
            'email' => Str::random(10).'@example.test',
            'phone' => '0611111111',
            'password' => Hash::make('Password1234'),
            'role' => 'expediteur',
            'city' => 'Casablanca',
            'created_at' => now(),
            'updated_at' => now(),
        ], $overrides);
    }
}
