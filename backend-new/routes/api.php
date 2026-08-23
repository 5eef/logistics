<?php

use App\Http\Controllers\AdminController;
use App\Http\Controllers\AuthController;
use App\Http\Controllers\ColisController;
use App\Http\Controllers\MiscController;
use App\Http\Controllers\ProfileController;
use App\Http\Controllers\TicketController;
use Illuminate\Support\Facades\Route;

// Public routes
Route::post('/auth/login', [AuthController::class, 'login'])->middleware('throttle:10,1');
Route::post('/auth/register', [AuthController::class, 'register'])->middleware('throttle:5,60');
Route::get('/colis/track/{trackingId}', [ColisController::class, 'track'])
    ->where('trackingId', '[A-Za-z0-9]{10}')
    ->middleware('throttle:60,1');
Route::get('/misc/cities', [MiscController::class, 'cities']);
Route::get('/misc/livreurs/online', [MiscController::class, 'livreursOnline'])->middleware('throttle:60,1');
Route::get('/profile/avatar/{filename}', [ProfileController::class, 'avatar'])
    ->where('filename', '[A-Za-z0-9._-]+');

// Protected routes
Route::middleware(['auth:sanctum', 'active', 'throttle:api'])->group(function () {
    Route::get('/auth/me', [AuthController::class, 'me']);
    Route::post('/auth/logout', [AuthController::class, 'logout']);
    Route::patch('/auth/me', [AuthController::class, 'updateMe']);
    Route::get('/auth/notifications', [AuthController::class, 'notifications']);
    Route::patch('/auth/notifications/{id}/read', [AuthController::class, 'readNotification']);

    Route::get('/profile', [ProfileController::class, 'show']);
    Route::patch('/profile', [ProfileController::class, 'update']);
    Route::post('/profile/avatar', [ProfileController::class, 'updateAvatar'])->middleware('throttle:10,1');

    Route::get('/colis/stats', [ColisController::class, 'stats']);
    Route::get('/colis', [ColisController::class, 'index']);
    Route::post('/colis', [ColisController::class, 'store']);
    Route::patch('/colis/{id}/status', [ColisController::class, 'updateStatus']);
    Route::post('/colis/{id}/validate-pin', [ColisController::class, 'validatePin'])->middleware('throttle:10,1');
    Route::post('/colis/{id}/rate', [ColisController::class, 'rate']);

    Route::get('/tickets', [TicketController::class, 'index']);
    Route::post('/tickets', [TicketController::class, 'store']);
    Route::post('/tickets/{id}/respond', [TicketController::class, 'respond']);

    // Admin routes
    Route::middleware('role:admin')->prefix('admin')->group(function () {
        Route::get('/stats', [AdminController::class, 'stats']);
        Route::get('/users', [AdminController::class, 'users']);
        Route::get('/colis', [AdminController::class, 'colis']);
        Route::get('/tickets', [AdminController::class, 'tickets']);
        Route::patch('/tickets/{id}', [AdminController::class, 'updateTicket']);
        Route::get('/couriers/pending', [AdminController::class, 'pendingCouriers']);
        Route::patch('/couriers/{id}/verify', [AdminController::class, 'verifyCourier']);
        Route::post('/couriers/{id}/warn', [AdminController::class, 'warnCourier']);
        Route::patch('/couriers/{id}/ban', [AdminController::class, 'banCourier']);
    });
});
