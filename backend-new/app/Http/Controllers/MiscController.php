<?php

namespace App\Http\Controllers;

use App\Models\User;

class MiscController extends Controller
{
    public function cities()
    {
        return response()->json([
            'Casablanca', 'Rabat', 'Marrakech', 'Fès', 'Tanger', 'Agadir',
            'Meknès', 'Oujda', 'Kénitra', 'Tétouan', 'Safi', 'Mohammedia',
            'Khouribga', 'Béni Mellal', 'El Jadida', 'Nador', 'Settat', 'Laâyoune',
        ]);
    }

    public function livreursOnline()
    {
        $query = User::query()
            ->select(['id', 'name', 'city', 'rating', 'rating_count', 'vehicle_type'])
            ->where('role', 'livreur')
            ->where('is_online', true)
            ->where('is_verified', true);
        if (request()->city) {
            $query->where('city', request()->city);
        }
        $livreurs = $query->get();
        $livreurs->each(fn (User $livreur) => $livreur->makeHidden(['avatar_url']));

        return response()->json($livreurs);
    }
}
