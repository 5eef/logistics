<?php

namespace App\Http\Controllers;

use Illuminate\Http\JsonResponse;
use Illuminate\Support\Facades\Cache;
use Illuminate\Support\Facades\DB;
use Throwable;

class HealthController extends Controller
{
    public function root(): JsonResponse
    {
        return response()->json([
            'status' => 'ok',
            'message' => 'Welcome to the logistics API.',
        ]);
    }

    public function health(): JsonResponse
    {
        return response()->json(['status' => 'ok']);
    }

    public function ready(): JsonResponse
    {
        try {
            DB::select('SELECT 1');
            Cache::get('__readiness_probe__');

            if (config('queue.default') === 'database') {
                DB::table(config('queue.connections.database.table', 'jobs'))->limit(1)->exists();
            }

            return response()->json(['status' => 'ok']);
        } catch (Throwable) {
            return response()->json(['status' => 'unavailable'], 503);
        }
    }
}
