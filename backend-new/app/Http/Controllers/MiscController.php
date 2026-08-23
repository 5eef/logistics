<?php

namespace App\Http\Controllers;

use App\Http\Resources\CourierPublicResource;
use App\Models\User;
use Illuminate\Http\Request;

class MiscController extends Controller
{
    public function cities()
    {
        return response()->json(config('logistics.cities'));
    }

    public function livreursOnline(Request $request)
    {
        $request->validate(['city' => ['nullable', 'string', 'max:100']]);
        $query = User::query()->where('role', 'livreur')->where('is_online', true)
            ->where('is_verified', true)->where('verification_status', 'approved');
        if ($request->filled('city')) {
            abort_unless(in_array($request->input('city'), config('logistics.cities'), true), 422, 'Ville non prise en charge.');
            $query->where('city', $request->input('city'));
        }

        return CourierPublicResource::collection($query->limit(100)->get());
    }
}
