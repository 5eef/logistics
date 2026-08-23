<?php

namespace Tests\Feature;

use App\Events\NotificationCreated;
use App\Models\Notification;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Event;
use Tests\TestCase;

class NotificationBroadcastTest extends TestCase
{
    use RefreshDatabase;

    public function test_a_new_notification_is_broadcast_to_its_owner_private_channel(): void
    {
        Event::fake([NotificationCreated::class]);
        $user = User::factory()->create();

        Notification::create([
            'user_id' => $user->id,
            'title' => 'Colis en route',
            'message' => 'Votre colis est en cours de livraison.',
            'type' => 'info',
        ]);

        Event::assertDispatched(NotificationCreated::class, function (NotificationCreated $event) use ($user) {
            return $event->broadcastOn()[0]->name === "private-users.{$user->id}";
        });
    }
}
