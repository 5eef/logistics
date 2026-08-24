<?php

namespace Database\Seeders;

use App\Models\User;
use Illuminate\Database\Seeder;
use Illuminate\Support\Facades\Hash;
use LogicException;

class StagingSeeder extends Seeder
{
    public function run(): void
    {
        if (! app()->environment('staging')) {
            throw new LogicException('StagingSeeder refuses to run outside APP_ENV=staging.');
        }

        $password = (string) env('STAGING_TEST_PASSWORD');
        $senderEmail = (string) env('STAGING_TEST_EMAIL', 'staging.sender@example.test');

        if (strlen($password) < 16 || str_contains(strtoupper($password), 'CHANGE_ME')) {
            throw new LogicException('STAGING_TEST_PASSWORD must be a non-placeholder value of at least 16 characters.');
        }

        $users = [
            [$senderEmail, 'Staging Sender', '+212600000101', 'expediteur', true],
            ['staging.recipient@example.test', 'Staging Recipient', '+212600000102', 'destinataire', true],
            ['staging.courier@example.test', 'Staging Courier', '+212600000103', 'livreur', true],
            ['staging.traveler@example.test', 'Staging Traveler', '+212600000104', 'voyageur', true],
            ['staging.admin@example.test', 'Staging Admin', '+212600000105', 'admin', true],
        ];

        foreach ($users as [$email, $name, $phone, $role, $approved]) {
            User::updateOrCreate(
                ['email' => $email],
                [
                    'name' => $name,
                    'phone' => $phone,
                    'password' => Hash::make($password),
                    'role' => $role,
                    'city' => 'Casablanca',
                    'is_verified' => $approved,
                    'verification_status' => $approved ? 'approved' : 'pending',
                    'phone_verified_at' => $role === 'destinataire' ? now() : null,
                    'cin' => in_array($role, ['livreur', 'voyageur'], true) ? 'TEST-STAGING-ONLY' : null,
                    'license_number' => $role === 'livreur' ? 'TEST-LICENSE' : null,
                    'vehicle_type' => $role === 'livreur' ? 'Test vehicle' : null,
                    'vehicle_plate' => $role === 'livreur' ? 'TEST-000' : null,
                    'warnings' => 0,
                    'is_banned' => false,
                ]
            );
        }

        $this->command?->info('Fictitious staging accounts are ready.');
    }
}
