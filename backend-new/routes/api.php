<?php

use App\Http\Controllers\AdminController;
use App\Http\Controllers\AuthController;
use App\Http\Controllers\ColisController;
use App\Http\Controllers\MiscController;
use App\Http\Controllers\PhoneVerificationController;
use App\Http\Controllers\ProfileController;
use App\Http\Controllers\TicketController;
use App\Http\Controllers\TravelerTripController;
use Illuminate\Support\Facades\Route;

// Public routes
Route::post('/auth/login', [AuthController::class, 'login'])->middleware('throttle:login');
Route::post('/auth/register', [AuthController::class, 'register'])->middleware('throttle:register');
Route::post('/auth/forgot-password', [AuthController::class, 'forgotPassword'])->middleware('throttle:5,1');
Route::post('/auth/reset-password', [AuthController::class, 'resetPassword'])->middleware('throttle:5,1');
Route::get('/colis/track/{trackingId}', [ColisController::class, 'track'])
    ->where('trackingId', '[A-Za-z0-9]{10,20}')
    ->middleware('throttle:publicTracking');
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
    Route::post('/auth/phone-verification/start', [PhoneVerificationController::class, 'start'])
        ->middleware('throttle:phoneVerificationStart');
    Route::post('/auth/phone-verification/confirm', [PhoneVerificationController::class, 'confirm'])
        ->middleware('throttle:phoneVerificationConfirm');

    Route::get('/profile', [ProfileController::class, 'show']);
    Route::patch('/profile', [ProfileController::class, 'update']);
    Route::post('/profile/avatar', [ProfileController::class, 'updateAvatar'])->middleware('throttle:10,1');

    Route::get('/colis/stats', [ColisController::class, 'stats']);
    Route::post('/colis/quote', [ColisController::class, 'quote']);
    Route::get('/colis', [ColisController::class, 'index']);
    Route::post('/colis', [ColisController::class, 'store']);
    Route::patch('/colis/{id}/status', [ColisController::class, 'updateStatus']);
    Route::post('/colis/{id}/validate-pin', [ColisController::class, 'validatePin'])->middleware('throttle:deliveryPin');
    Route::post('/colis/{id}/rate', [ColisController::class, 'rate']);

    Route::get('/tickets', [TicketController::class, 'index']);
    Route::post('/tickets', [TicketController::class, 'store']);
    Route::post('/tickets/{id}/respond', [TicketController::class, 'respond']);

    Route::get('/traveler-trips', [TravelerTripController::class, 'index']);
    Route::post('/traveler-trips', [TravelerTripController::class, 'store']);
    Route::patch('/traveler-trips/{id}/cancel', [TravelerTripController::class, 'cancel']);

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
        Route::patch('/colis/{id}/override-status', [AdminController::class, 'overrideStatus']);
        Route::patch('/colis/{id}/payment', [AdminController::class, 'updatePayment']);
    });
});
