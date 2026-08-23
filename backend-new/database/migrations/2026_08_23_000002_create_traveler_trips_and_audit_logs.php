<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('traveler_trips', function (Blueprint $table) {
            $table->id();
            $table->foreignId('user_id')->constrained('users')->cascadeOnDelete();
            $table->string('from_city', 100);
            $table->string('to_city', 100);
            $table->date('departure_date');
            $table->string('status', 20)->default('active');
            $table->timestamps();
            $table->index(['user_id', 'status', 'departure_date'], 'traveler_trips_active_idx');
            $table->index(['from_city', 'to_city', 'status'], 'traveler_trips_route_idx');
        });

        Schema::create('audit_logs', function (Blueprint $table) {
            $table->id();
            $table->foreignId('actor_user_id')->nullable()->constrained('users')->nullOnDelete();
            $table->string('action', 100);
            $table->string('target_type', 150);
            $table->unsignedBigInteger('target_id');
            $table->string('reason', 500)->nullable();
            $table->json('old_values')->nullable();
            $table->json('new_values')->nullable();
            $table->timestamp('created_at')->useCurrent();
            $table->index(['target_type', 'target_id', 'created_at'], 'audit_target_idx');
            $table->index(['actor_user_id', 'created_at'], 'audit_actor_idx');
        });

        Schema::create('password_reset_tokens', function (Blueprint $table) {
            $table->string('email')->primary();
            $table->string('token');
            $table->timestamp('created_at')->nullable();
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('password_reset_tokens');
        Schema::dropIfExists('audit_logs');
        Schema::dropIfExists('traveler_trips');
    }
};
