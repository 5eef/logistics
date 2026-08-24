#!/bin/sh
set -eu

php artisan config:cache --no-ansi
php artisan route:cache --no-ansi
php artisan view:cache --no-ansi

exec "$@"
