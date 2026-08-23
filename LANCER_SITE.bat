@echo off
setlocal EnableExtensions
chcp 65001 >nul
set "PROJECT_ROOT=%~dp0"

echo ============================================
echo   LOGISTICS SCHOOL - Environnement local
echo ============================================

where php >nul 2>&1 || (echo ERREUR: PHP est introuvable. & exit /b 1)
where composer >nul 2>&1 || (echo ERREUR: Composer est introuvable. & exit /b 1)
where node >nul 2>&1 || (echo ERREUR: Node.js est introuvable. & exit /b 1)
where npm.cmd >nul 2>&1 || (echo ERREUR: npm est introuvable. & exit /b 1)

cd /d "%PROJECT_ROOT%backend-new" || exit /b 1
if not exist ".env" (
  copy ".env.example" ".env" >nul || goto :error
)
if not exist "database\database.sqlite" type nul > "database\database.sqlite"

call composer install --no-interaction || goto :error
for /f "tokens=1,* delims==" %%A in ('findstr /B /C:"APP_KEY=" .env') do set "LOCAL_APP_KEY=%%B"
if not defined LOCAL_APP_KEY php artisan key:generate --ansi || goto :error
php artisan migrate || goto :error

if /I "%DEMO_SEED%"=="1" (
  findstr /B /C:"APP_ENV=production" .env >nul && (echo ERREUR: seeding de demonstration interdit en production. & exit /b 1)
  php artisan db:seed || goto :error
)

cd /d "%PROJECT_ROOT%frontend" || exit /b 1
if not exist ".env" (
  copy ".env.example" ".env" >nul || goto :error
)
call npm.cmd ci || goto :error

echo.
echo Backend :  http://127.0.0.1:8000
echo Frontend : http://127.0.0.1:5173
echo Reverb :   ws://127.0.0.1:8080
echo.
start "LOGISTICS API" cmd /k "cd /d ""%PROJECT_ROOT%backend-new"" && php artisan serve --host=127.0.0.1 --port=8000"
start "LOGISTICS QUEUE" cmd /k "cd /d ""%PROJECT_ROOT%backend-new"" && php artisan queue:work --tries=3"
start "LOGISTICS REVERB" cmd /k "cd /d ""%PROJECT_ROOT%backend-new"" && php artisan reverb:start"
start "LOGISTICS FRONTEND" cmd /k "cd /d ""%PROJECT_ROOT%frontend"" && npm.cmd run dev -- --host 127.0.0.1 --port 5173"
exit /b 0

:error
echo.
echo ERREUR: le lancement a ete interrompu. Consultez le message ci-dessus.
exit /b 1
