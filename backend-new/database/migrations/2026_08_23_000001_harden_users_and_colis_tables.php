<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::table('users', function (Blueprint $table) {
            $table->timestamp('phone_verified_at')->nullable()->after('phone');
            $table->timestamp('verified_at')->nullable()->after('verification_status');
            $table->foreignId('verified_by')->nullable()->after('verified_at')->constrained('users')->nullOnDelete();
            $table->string('verification_reason', 500)->nullable()->after('verified_by');
        });

        Schema::table('colis', function (Blueprint $table) {
            $table->decimal('price', 12, 2)->change();
            $table->uuid('client_request_id')->nullable()->after('tracking_id');
            $table->string('payment_status', 20)->default('unpaid')->after('is_paid');
            $table->timestamp('paid_at')->nullable()->after('payment_method');
            $table->unsignedTinyInteger('pin_attempts')->default(0)->after('pin_validated');
            $table->timestamp('pin_locked_until')->nullable()->after('pin_attempts');
            $table->timestamp('delivered_at')->nullable()->after('estimated_delivery');
            $table->unique(['expediteur_id', 'client_request_id'], 'colis_sender_request_unique');
        });

        // Legacy `is_paid` may have been set automatically on delivery and is
        // not reliable proof of payment. Keep it explicitly unverified until
        // an operator reconciles it against a trustworthy payment source.
        DB::table('colis')->where('is_paid', true)->update([
            'is_paid' => false,
            'payment_status' => 'legacy_unverified',
            'paid_at' => null,
        ]);
        DB::table('colis')->where('status', 'delivered')->update([
            'delivered_at' => DB::raw('updated_at'),
        ]);
    }

    public function down(): void
    {
        Schema::table('colis', function (Blueprint $table) {
            $table->dropUnique('colis_sender_request_unique');
            $table->dropColumn([
                'client_request_id', 'payment_status', 'paid_at', 'pin_attempts',
                'pin_locked_until', 'delivered_at',
            ]);
            $table->float('price')->change();
        });

        Schema::table('users', function (Blueprint $table) {
            $table->dropConstrainedForeignId('verified_by');
            $table->dropColumn(['phone_verified_at', 'verified_at', 'verification_reason']);
        });
    }
};
