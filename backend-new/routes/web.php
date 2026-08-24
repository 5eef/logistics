<?php

use App\Http\Controllers\HealthController;
use Illuminate\Support\Facades\Route;

/*
|--------------------------------------------------------------------------
| Web Routes
|--------------------------------------------------------------------------
|
| This file is required by backend-new/bootstrap/app.php via:
|   withRouting(web: __DIR__.'/../routes/web.php')
|
*/

Route::get('/', [HealthController::class, 'root']);
