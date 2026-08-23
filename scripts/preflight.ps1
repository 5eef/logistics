[CmdletBinding()]
param()

$ErrorActionPreference = 'Stop'
$projectRoot = Split-Path -Parent $PSScriptRoot
$backendRoot = Join-Path $projectRoot 'backend-new'
$frontendRoot = Join-Path $projectRoot 'frontend'
$script:failures = 0

function Invoke-Check {
    param([string]$Name, [scriptblock]$Action)
    Write-Host "`n== $Name ==" -ForegroundColor Cyan
    try {
        & $Action
        if ($LASTEXITCODE -ne 0) { throw "Code de sortie $LASTEXITCODE" }
        Write-Host "OK: $Name" -ForegroundColor Green
    } catch {
        $script:failures++
        Write-Host "ECHEC: $Name - $($_.Exception.Message)" -ForegroundColor Red
    }
}

function Test-CommandAvailable {
    param([string]$Command)
    if (-not (Get-Command $Command -ErrorAction SilentlyContinue)) { throw "$Command est introuvable dans PATH" }
}

function Get-SafeEnvValue {
    param([string]$Path, [string]$Name)
    $match = Select-String -LiteralPath $Path -Pattern "^$([regex]::Escape($Name))=(.*)$" | Select-Object -First 1
    if ($match) { return $match.Matches[0].Groups[1].Value.Trim() }
    return $null
}

function Test-IsPlaceholder {
    param([AllowNull()][string]$Value)
    return [string]::IsNullOrWhiteSpace($Value) -or $Value -match '(?i)example\.com|replace[-_ ]?with|changeme|your[-_]|placeholder|^secret$|^null$|^none$'
}

function Assert-TrueValue {
    param([string]$Name, [AllowNull()][string]$Value)
    if ($Value -ne 'true') { throw "$Name doit valoir true" }
}

Write-Host 'Preflight production Logistics School (aucun deploiement, aucune mutation de base)' -ForegroundColor Yellow

Invoke-Check 'Etat Git' {
    Push-Location $projectRoot
    try { git branch --show-current; git status --short } finally { Pop-Location }
}

Invoke-Check 'Outils requis' {
    foreach ($tool in @('git', 'php', 'composer', 'node', 'npm.cmd')) { Test-CommandAvailable $tool }
    php -v
    composer --version
    node --version
    npm.cmd --version
}

Invoke-Check 'Extensions PHP' {
    $modules = php -m
    foreach ($extension in @('ctype', 'curl', 'fileinfo', 'filter', 'hash', 'mbstring', 'openssl', 'pdo', 'tokenizer', 'xml')) {
        if ($modules -notcontains $extension) { throw "Extension PHP manquante: $extension" }
    }
}

Invoke-Check 'Configuration production sans exposition des secrets' {
    $envPath = Join-Path $backendRoot '.env'
    if (-not (Test-Path -LiteralPath $envPath)) { throw 'backend-new/.env est absent' }
    $environment = Get-SafeEnvValue $envPath 'APP_ENV'
    $debug = Get-SafeEnvValue $envPath 'APP_DEBUG'
    if ($environment -ne 'production') { throw 'APP_ENV doit valoir production' }
    if ($debug -ne 'false') { throw 'APP_DEBUG doit valoir false' }
    foreach ($name in @('APP_KEY', 'DB_PASSWORD')) {
        if (Test-IsPlaceholder (Get-SafeEnvValue $envPath $name)) { throw "$name est absent ou contient un placeholder (valeur non affichee)" }
    }
    foreach ($name in @('APP_URL', 'FRONTEND_URL', 'CORS_ALLOWED_ORIGINS', 'SANCTUM_STATEFUL_DOMAINS', 'DB_HOST', 'DB_DATABASE', 'SESSION_DOMAIN')) {
        $value = Get-SafeEnvValue $envPath $name
        if (Test-IsPlaceholder $value) {
            throw "$name est absent ou contient un placeholder"
        }
    }

    $appUrl = [uri](Get-SafeEnvValue $envPath 'APP_URL')
    $frontendUrl = [uri](Get-SafeEnvValue $envPath 'FRONTEND_URL')
    if ($appUrl.Scheme -ne 'https') { throw 'APP_URL doit utiliser HTTPS' }
    if ($frontendUrl.Scheme -ne 'https') { throw 'FRONTEND_URL doit utiliser HTTPS' }
    Assert-TrueValue 'SESSION_SECURE_COOKIE' (Get-SafeEnvValue $envPath 'SESSION_SECURE_COOKIE')
    Assert-TrueValue 'SESSION_HTTP_ONLY' (Get-SafeEnvValue $envPath 'SESSION_HTTP_ONLY')

    $sessionDomain = (Get-SafeEnvValue $envPath 'SESSION_DOMAIN').TrimStart('.')
    if (-not $appUrl.Host.EndsWith($sessionDomain) -or -not $frontendUrl.Host.EndsWith($sessionDomain)) {
        throw 'SESSION_DOMAIN ne couvre pas de maniere coherente APP_URL et FRONTEND_URL'
    }

    $corsOrigins = (Get-SafeEnvValue $envPath 'CORS_ALLOWED_ORIGINS') -split ',' | ForEach-Object { $_.Trim().TrimEnd('/') }
    if ($corsOrigins -contains '*' -or $corsOrigins -notcontains $frontendUrl.AbsoluteUri.TrimEnd('/')) {
        throw 'CORS_ALLOWED_ORIGINS doit etre explicite et inclure exactement FRONTEND_URL'
    }
    $sanctumDomains = (Get-SafeEnvValue $envPath 'SANCTUM_STATEFUL_DOMAINS') -split ',' | ForEach-Object { $_.Trim() }
    if ($sanctumDomains -contains '*' -or $sanctumDomains -notcontains $frontendUrl.Authority) {
        throw 'SANCTUM_STATEFUL_DOMAINS doit inclure le host frontend sans schema et sans wildcard'
    }

    $dbConnection = Get-SafeEnvValue $envPath 'DB_CONNECTION'
    if ($dbConnection -eq 'sqlite') { throw 'La base de production ne doit pas utiliser SQLite' }

    $mailer = Get-SafeEnvValue $envPath 'MAIL_MAILER'
    if ($mailer -in @('log', 'array', $null, '')) { throw 'Un mailer reel est obligatoire pour le reset de mot de passe' }
    foreach ($name in @('MAIL_FROM_ADDRESS', 'MAIL_HOST', 'MAIL_USERNAME', 'MAIL_PASSWORD')) {
        if (Test-IsPlaceholder (Get-SafeEnvValue $envPath $name)) { throw "$name est absent ou contient un placeholder (valeur non affichee)" }
    }

    $phoneEnabled = Get-SafeEnvValue $envPath 'PHONE_VERIFICATION_ENABLED'
    $phoneDriver = Get-SafeEnvValue $envPath 'PHONE_VERIFICATION_DRIVER'
    if ($phoneEnabled -eq 'true') {
        throw "La verification telephone doit rester desactivee pour cette release: le seul driver fonctionnel ($phoneDriver) est reserve a local/testing et le fallback production echoue volontairement"
    }

    $realtimeEnabled = (Get-SafeEnvValue $envPath 'BROADCAST_CONNECTION') -eq 'reverb'
    if ($realtimeEnabled) {
        foreach ($name in @('REVERB_APP_ID', 'REVERB_APP_KEY', 'REVERB_APP_SECRET', 'REVERB_HOST', 'REVERB_ALLOWED_ORIGINS')) {
            if (Test-IsPlaceholder (Get-SafeEnvValue $envPath $name)) { throw "$name est absent ou contient un placeholder (valeur non affichee)" }
        }
        if ((Get-SafeEnvValue $envPath 'REVERB_SCHEME') -ne 'https') { throw 'REVERB_SCHEME doit valoir https en production' }
        $reverbOrigins = (Get-SafeEnvValue $envPath 'REVERB_ALLOWED_ORIGINS') -split ',' | ForEach-Object { $_.Trim().TrimEnd('/') }
        if ($reverbOrigins -contains '*' -or $reverbOrigins -notcontains $frontendUrl.AbsoluteUri.TrimEnd('/')) {
            throw 'REVERB_ALLOWED_ORIGINS doit inclure exactement FRONTEND_URL et ne jamais contenir de wildcard'
        }
    }
    Write-Host 'Configuration publique, domaines, sessions, mail, telephone, realtime et presence des secrets valides; aucune valeur secrete affichee.'
}

Invoke-Check 'Backend: configuration, DB et routes' {
    Push-Location $backendRoot
    try {
        php artisan about --only=environment
        $migrationStatus = php artisan migrate:status --no-ansi 2>&1
        if ($LASTEXITCODE -ne 0) { throw 'Impossible de lire le statut des migrations' }
        if ($migrationStatus -match '\bPending\b') { throw 'Des migrations sont Pending; appliquer uniquement via le runbook staging/production approuve' }
        Write-Host 'Migration ledger: aucune migration Pending.'
        php artisan route:list
        php artisan config:show app | Out-Null
    } finally { Pop-Location }
}

Invoke-Check 'Backend: dependances et qualite' {
    Push-Location $backendRoot
    try {
        composer validate --strict --no-check-publish
        composer audit --locked
        composer lint
        composer analyse
        php artisan test
    } finally { Pop-Location }
}

Invoke-Check 'Frontend: installation verrouillee et qualite' {
    Push-Location $frontendRoot
    try {
        npm.cmd ci
        npm.cmd audit --audit-level=high
        npm.cmd run lint
        npm.cmd run typecheck
        npm.cmd test
        npm.cmd run build
        npm.cmd run test:e2e
    } finally { Pop-Location }
}

if ($script:failures -gt 0) {
    Write-Host "`nPREFLIGHT EN ECHEC: $script:failures controle(s) non valide(s)." -ForegroundColor Red
    exit 1
}

Write-Host "`nPREFLIGHT REUSSI. Aucun deploiement n'a ete effectue." -ForegroundColor Green
exit 0
