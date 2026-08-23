<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::table('colis', function (Blueprint $table) {
            $table->index(['status', 'from_city', 'to_city'], 'colis_availability_idx');
            $table->index(['expediteur_id', 'created_at'], 'colis_sender_created_idx');
            $table->index(['livreur_id', 'created_at'], 'colis_courier_created_idx');
            $table->index(['voyageur_id', 'created_at'], 'colis_traveler_created_idx');
            $table->index(['destinataire_id', 'created_at'], 'colis_recipient_created_idx');
            $table->index(['payment_status', 'paid_at'], 'colis_payment_idx');
        });
        Schema::table('users', function (Blueprint $table) {
            $table->index(['role', 'city', 'is_online', 'is_verified'], 'users_carrier_search_idx');
            $table->index(['role', 'verification_status'], 'users_moderation_idx');
        });
        Schema::table('tickets', function (Blueprint $table) {
            $table->index(['user_id', 'created_at'], 'tickets_user_created_idx');
            $table->index(['status', 'created_at'], 'tickets_status_created_idx');
        });
        Schema::table('notifications', function (Blueprint $table) {
            $table->index(['user_id', 'is_read', 'created_at'], 'notifications_user_read_idx');
        });
    }

    public function down(): void
    {
        Schema::table('notifications', fn (Blueprint $table) => $table->dropIndex('notifications_user_read_idx'));
        Schema::table('tickets', function (Blueprint $table) {
            $table->dropIndex('tickets_user_created_idx');
            $table->dropIndex('tickets_status_created_idx');
        });
        Schema::table('users', function (Blueprint $table) {
            $table->dropIndex('users_carrier_search_idx');
            $table->dropIndex('users_moderation_idx');
        });
        Schema::table('colis', function (Blueprint $table) {
            $table->dropIndex('colis_availability_idx');
            $table->dropIndex('colis_sender_created_idx');
            $table->dropIndex('colis_courier_created_idx');
            $table->dropIndex('colis_traveler_created_idx');
            $table->dropIndex('colis_recipient_created_idx');
            $table->dropIndex('colis_payment_idx');
        });
    }
};
