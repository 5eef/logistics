<?php

namespace Database\Seeders;

use App\Models\Colis;
use App\Models\Notification;
use App\Models\StatusHistory;
use App\Models\Ticket;
use App\Models\User;
use Illuminate\Database\Seeder;
use Illuminate\Support\Facades\Hash;

class DatabaseSeeder extends Seeder
{
    public function run(): void
    {
        if (app()->isProduction()) {
            throw new \LogicException('Le seeder de démonstration ne peut pas être exécuté en production.');
        }

        // Users (idempotent)
        $admin = User::updateOrCreate(
            ['email' => 'admin@logistics.ma'],
            [
                'name' => 'Admin Logistics',
                'phone' => '0600000000',
                'password' => Hash::make('admin123'),
                'role' => 'admin',
                'city' => 'Casablanca',
                'avatar_path' => null,
                'rating' => 5,
                'rating_count' => 0,
                'is_verified' => true,
                'verification_status' => 'approved',
                'warnings' => 0,
                'is_banned' => false,
            ]
        );

        $exp = User::updateOrCreate(
            ['email' => 'expediteur@test.ma'],
            [
                'name' => 'Mohammed Alami',
                'phone' => '0611111111',
                'password' => Hash::make('test123'),
                'role' => 'expediteur',
                'city' => 'Casablanca',
                'avatar_path' => null,
                'rating' => 4.5,
                'rating_count' => 12,
                'is_verified' => true,
                'verification_status' => 'approved',
                'warnings' => 0,
                'is_banned' => false,
            ]
        );

        $liv = User::updateOrCreate(
            ['email' => 'livreur@test.ma'],
            [
                'name' => 'Youssef Bennani',
                'phone' => '0622222222',
                'password' => Hash::make('test123'),
                'role' => 'livreur',
                'city' => 'Casablanca',
                'avatar_path' => null,
                'rating' => 4.8,
                'rating_count' => 47,
                'is_online' => true,
                'is_verified' => true,
                'verification_status' => 'approved',
                'cin' => 'BK123456',
                'license_number' => 'C123456',
                'vehicle_type' => 'Moto',
                'vehicle_plate' => '12345-A-1',
                'warnings' => 0,
                'is_banned' => false,
            ]
        );

        $dest = User::updateOrCreate(
            ['email' => 'destinataire@test.ma'],
            [
                'name' => 'Fatima Zahra',
                'phone' => '0633333333',
                'password' => Hash::make('test123'),
                'role' => 'destinataire',
                'city' => 'Casablanca',
                'avatar_path' => null,
                'rating' => 4.9,
                'rating_count' => 8,
                'is_verified' => true,
                'verification_status' => 'approved',
                'warnings' => 0,
                'is_banned' => false,
            ]
        );

        $liv2 = User::updateOrCreate(
            ['email' => 'livreur2@test.ma'],
            [
                'name' => 'Karim Tazi',
                'phone' => '0644444444',
                'password' => Hash::make('test123'),
                'role' => 'livreur',
                'city' => 'Marrakech',
                'avatar_path' => null,
                'rating' => 4.2,
                'rating_count' => 23,
                'is_online' => false,
                'is_verified' => false,
                'verification_status' => 'pending',
                'cin' => 'M456789',
                'license_number' => 'M789012',
                'vehicle_type' => 'Voiture',
                'vehicle_plate' => '78901-B-4',
                'warnings' => 1,
                'is_banned' => false,
            ]
        );

        $voy = User::updateOrCreate(
            ['email' => 'voyageur@test.ma'],
            [
                'name' => 'Sara Ouali',
                'phone' => '0655555555',
                'password' => Hash::make('test123'),
                'role' => 'voyageur',
                'city' => 'Casablanca',
                'avatar_path' => null,
                'rating' => 4.7,
                'rating_count' => 5,
                'is_verified' => false,
                'verification_status' => 'pending',
                'warnings' => 0,
                'is_banned' => false,
            ]
        );

        // Colis: keep as create (existing app likely assumes clean DB), but avoid duplicating on reruns
        // by keying on tracking_id.
        $c1 = Colis::updateOrCreate(
            ['tracking_id' => 'LOG2024ABC'],
            [
                'expediteur_id' => $exp->id,
                'livreur_id' => $liv->id,
                'status' => 'in_transit',
                'from_city' => 'Casablanca',
                'to_city' => 'Casablanca',
                'from_address' => '123 Rue Mohammed V, Casablanca',
                'to_address' => '456 Bd Hassan II, Ain Diab',
                'recipient_name' => 'Fatima Zahra',
                'recipient_phone' => '0633333333',
                'weight' => 2.5,
                'description' => 'Vêtements et accessoires',
                'price' => 45,
                'is_paid' => false,
                'pin_code' => Hash::make('4521'),
                'pin_validated' => false,
                'qr_code' => 'QR_c1',
                'is_voyageur_eligible' => false,
                'estimated_delivery' => now()->addDay(),
            ]
        );

        // StatusHistory can duplicate; only insert if empty for colis
        if (! StatusHistory::where('colis_id', $c1->id)->exists()) {
            StatusHistory::insert([
                [
                    'colis_id' => $c1->id,
                    'status' => 'created',
                    'message' => "Colis créé par l'expéditeur",
                    'city' => 'Casablanca',
                    'updated_by' => $exp->id,
                    'created_at' => now(),
                    'updated_at' => now(),
                ],
                [
                    'colis_id' => $c1->id,
                    'status' => 'picked_up',
                    'message' => 'Colis récupéré par le livreur',
                    'city' => 'Casablanca',
                    'updated_by' => $liv->id,
                    'created_at' => now(),
                    'updated_at' => now(),
                ],
                [
                    'colis_id' => $c1->id,
                    'status' => 'in_transit',
                    'message' => 'En cours de livraison',
                    'city' => 'Casablanca',
                    'updated_by' => $liv->id,
                    'created_at' => now(),
                    'updated_at' => now(),
                ],
            ]);
        }

        $c2 = Colis::updateOrCreate(
            ['tracking_id' => 'LOG2024DEF'],
            [
                'expediteur_id' => $exp->id,
                'status' => 'pending',
                'from_city' => 'Casablanca',
                'to_city' => 'Rabat',
                'from_address' => '78 Rue Zerktouni, Casablanca',
                'to_address' => '12 Avenue Hassan II, Rabat',
                'recipient_name' => 'Ahmed Rachidi',
                'recipient_phone' => '0677777777',
                'weight' => 1.2,
                'description' => 'Documents importants',
                'price' => 65,
                'is_paid' => false,
                'pin_code' => Hash::make('8834'),
                'pin_validated' => false,
                'qr_code' => 'QR_c2',
                'is_voyageur_eligible' => true,
                'estimated_delivery' => now()->addDays(2),
            ]
        );

        if (! StatusHistory::where('colis_id', $c2->id)->exists()) {
            StatusHistory::insert([
                [
                    'colis_id' => $c2->id,
                    'status' => 'created',
                    'message' => 'Colis créé',
                    'city' => 'Casablanca',
                    'updated_by' => $exp->id,
                    'created_at' => now(),
                    'updated_at' => now(),
                ],
                [
                    'colis_id' => $c2->id,
                    'status' => 'pending',
                    'message' => 'En attente d\'un livreur',
                    'city' => 'Casablanca',
                    'updated_by' => $exp->id,
                    'created_at' => now(),
                    'updated_at' => now(),
                ],
            ]);
        }

        $c3 = Colis::updateOrCreate(
            ['tracking_id' => 'LOG2024GHI'],
            [
                'expediteur_id' => $exp->id,
                'livreur_id' => $liv->id,
                'status' => 'delivered',
                'from_city' => 'Casablanca',
                'to_city' => 'Casablanca',
                'from_address' => '200 Bd Anfa, Casablanca',
                'to_address' => '55 Rue des FAR, Casablanca',
                'recipient_name' => 'Nadia Benali',
                'recipient_phone' => '0688888888',
                'weight' => 3.8,
                'description' => 'Matériel électronique',
                'price' => 80,
                'is_paid' => true,
                'payment_method' => 'cash',
                'pin_code' => Hash::make('1122'),
                'pin_validated' => true,
                'qr_code' => 'QR_c3',
                'is_voyageur_eligible' => false,
                'estimated_delivery' => now()->subDay(),
            ]
        );

        if (! StatusHistory::where('colis_id', $c3->id)->exists()) {
            StatusHistory::insert([
                [
                    'colis_id' => $c3->id,
                    'status' => 'created',
                    'message' => 'Colis créé',
                    'city' => 'Casablanca',
                    'updated_by' => $exp->id,
                    'created_at' => now()->subDays(2),
                    'updated_at' => now()->subDays(2),
                ],
                [
                    'colis_id' => $c3->id,
                    'status' => 'picked_up',
                    'message' => 'Colis récupéré',
                    'city' => 'Casablanca',
                    'updated_by' => $liv->id,
                    'created_at' => now()->subDay(),
                    'updated_at' => now()->subDay(),
                ],
                [
                    'colis_id' => $c3->id,
                    'status' => 'delivered',
                    'message' => 'Colis livré avec succès',
                    'city' => 'Casablanca',
                    'updated_by' => $liv->id,
                    'created_at' => now()->subHours(12),
                    'updated_at' => now()->subHours(12),
                ],
            ]);
        }

        $c4 = Colis::updateOrCreate(
            ['tracking_id' => 'LOG2024JKL'],
            [
                'expediteur_id' => $exp->id,
                'status' => 'pending',
                'from_city' => 'Casablanca',
                'to_city' => 'Marrakech',
                'from_address' => '10 Rue Allal Ben Abdallah, Casablanca',
                'to_address' => 'Place Jemaa el-Fna, Marrakech',
                'recipient_name' => 'Omar Bensouda',
                'recipient_phone' => '0699999999',
                'weight' => 5.0,
                'description' => 'Produits artisanaux',
                'price' => 120,
                'is_paid' => false,
                'pin_code' => Hash::make('3344'),
                'pin_validated' => false,
                'qr_code' => 'QR_c4',
                'is_voyageur_eligible' => true,
                'estimated_delivery' => now()->addDays(3),
            ]
        );

        if (! StatusHistory::where('colis_id', $c4->id)->exists()) {
            StatusHistory::insert([
                [
                    'colis_id' => $c4->id,
                    'status' => 'created',
                    'message' => 'Colis créé',
                    'city' => 'Casablanca',
                    'updated_by' => $exp->id,
                    'created_at' => now(),
                    'updated_at' => now(),
                ],
                [
                    'colis_id' => $c4->id,
                    'status' => 'pending',
                    'message' => 'En attente d\'un livreur',
                    'city' => 'Casablanca',
                    'updated_by' => $exp->id,
                    'created_at' => now(),
                    'updated_at' => now(),
                ],
            ]);
        }

        // Ticket: avoid duplicates based on user_id+colis_id+subject
        Ticket::updateOrCreate(
            ['user_id' => $exp->id, 'colis_id' => $c1->id, 'subject' => 'Retard de livraison'],
            ['message' => 'Mon colis LOG2024ABC devrait être livré mais est toujours en transit.', 'status' => 'open', 'priority' => 'medium']
        );

        // Notifications: only insert if none exist for this colis
        if (! Notification::where('user_id', $exp->id)->where('title', 'Colis en transit')->exists()) {
            Notification::insert([
                [
                    'user_id' => $exp->id,
                    'title' => 'Colis en transit',
                    'message' => 'Votre colis LOG2024ABC est en cours de livraison.',
                    'type' => 'info',
                    'is_read' => false,
                    'created_at' => now(),
                    'updated_at' => now(),
                ],
                [
                    'user_id' => $dest->id,
                    'title' => 'Colis en route',
                    'message' => 'Votre colis sera livré aujourd\'hui. Code PIN: 4521',
                    'type' => 'success',
                    'is_read' => false,
                    'created_at' => now(),
                    'updated_at' => now(),
                ],
                [
                    'user_id' => $liv->id,
                    'title' => 'Nouveau colis',
                    'message' => 'Un nouveau colis est disponible à Casablanca.',
                    'type' => 'info',
                    'is_read' => false,
                    'created_at' => now(),
                    'updated_at' => now(),
                ],
            ]);
        }

        $this->command->info('Base de données initialisée avec succès!');
    }
}
