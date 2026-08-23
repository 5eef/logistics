<?php

namespace App\Providers;

use App\Contracts\PhoneVerificationProvider;
use App\Services\FailClosedPhoneVerificationProvider;
use App\Services\LocalPhoneVerificationProvider;
use Illuminate\Auth\Notifications\ResetPassword;
use Illuminate\Cache\RateLimiting\Limit;
use Illuminate\Http\Request;
use Illuminate\Http\Resources\Json\JsonResource;
use Illuminate\Support\Facades\RateLimiter;
use Illuminate\Support\ServiceProvider;
use Illuminate\Support\Str;

class AppServiceProvider extends ServiceProvider
{
    /**
     * Register any application services.
     */
    public function register(): void
    {
        $this->app->bind(PhoneVerificationProvider::class, function ($app) {
            $driver = config('logistics.phone_verification.driver');
            if ($driver === 'local') {
                if (! $app->environment(['local', 'testing'])) {
                    return $app->make(FailClosedPhoneVerificationProvider::class);
                }

                return $app->make(LocalPhoneVerificationProvider::class);
            }

            return $app->make(FailClosedPhoneVerificationProvider::class);
        });
    }

    /**
     * Bootstrap any application services.
     */
    public function boot(): void
    {
        JsonResource::withoutWrapping();
        ResetPassword::createUrlUsing(function (object $notifiable, string $token): string {
            return rtrim((string) config('logistics.frontend_url'), '/').'/reset-password?'.http_build_query([
                'token' => $token,
                'email' => $notifiable->getEmailForPasswordReset(),
            ], '', '&', PHP_QUERY_RFC3986);
        });
        RateLimiter::for('api', function (Request $request) {
            $key = $request->user()?->id
                ? 'user:'.$request->user()->id
                : 'ip:'.$request->ip();

            return Limit::perMinute(120)->by($key);
        });

        RateLimiter::for('login', fn (Request $request) => [
            Limit::perMinute(10)->by('login:'.Str::lower((string) $request->input('email')).'|'.$request->ip()),
            Limit::perMinute(50)->by('login-ip:'.$request->ip()),
        ]);
        RateLimiter::for('register', fn (Request $request) => Limit::perHour(5)->by('register:'.$request->ip()));
        RateLimiter::for('publicTracking', fn (Request $request) => [
            Limit::perMinute(60)->by('tracking-ip:'.$request->ip()),
            Limit::perMinute(15)->by('tracking-id:'.strtoupper((string) $request->route('trackingId')).'|'.$request->ip()),
        ]);
        RateLimiter::for('deliveryPin', fn (Request $request) => [
            Limit::perMinute(10)->by('pin-user:'.$request->user()?->id),
            Limit::perMinute(5)->by('pin-shipment:'.$request->user()?->id.'|'.$request->route('id')),
        ]);
        RateLimiter::for('phoneVerificationStart', fn (Request $request) => [
            Limit::perHour(5)->by('phone-start-user:'.$request->user()?->id),
            Limit::perHour(20)->by('phone-start-ip:'.$request->ip()),
        ]);
        RateLimiter::for('phoneVerificationConfirm', fn (Request $request) => [
            Limit::perMinute(5)->by('phone-confirm-user:'.$request->user()?->id),
            Limit::perMinute(20)->by('phone-confirm-ip:'.$request->ip()),
        ]);
    }
}
