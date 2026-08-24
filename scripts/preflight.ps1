[CmdletBinding()]
param(
    [ValidateSet('staging', 'production')]
    [string]$Environment = 'production',
    [switch]$RequireRunning,
    [switch]$SkipTests
)

$ErrorActionPreference = 'Stop'
$projectRoot = Split-Path -Parent $PSScriptRoot
$backendRoot = Join-Path $projectRoot 'backend-new'
$frontendRoot = Join-Path $projectRoot 'frontend'
$composeFile = Join-Path $projectRoot 'docker-compose.staging.yml'
$envPath = if ($Environment -eq 'staging') {
    Join-Path $projectRoot '.env.staging'
} else {
    Join-Path $backendRoot '.env'
}
$script:failures = 0

function Invoke-Check {
    param([string]$Name, [scriptblock]$Action)
    Write-Host "`n== $Name ==" -ForegroundColor Cyan
    try {
        & $Action
        Write-Host "OK: $Name" -ForegroundColor Green
    } catch {
        $script:failures++
        Write-Host "ECHEC: $Name - $($_.Exception.Message)" -ForegroundColor Red
    }
}

function Assert-LastExitCode {
    param([string]$Message)
    if ($LASTEXITCODE -ne 0) { throw "$Message (code $LASTEXITCODE)" }
}

function Get-EnvValue {
    param([string]$Name)
    $match = Select-String -LiteralPath $envPath -Pattern "^$([regex]::Escape($Name))=(.*)$" | Select-Object -First 1
    if (-not $match) { return $null }
    $value = $match.Matches[0].Groups[1].Value.Trim()
    if (($value.StartsWith('"') -and $value.EndsWith('"')) -or ($value.StartsWith("'") -and $value.EndsWith("'"))) {
        return $value.Substring(1, $value.Length - 2)
    }
    return $value
}

function Test-Placeholder {
    param([AllowNull()][string]$Value)
    return [string]::IsNullOrWhiteSpace($Value) -or $Value -match '(?i)change_me|changeme|example\.com|replace[-_ ]?with|your[-_]|placeholder|^secret$|^null$|^none$'
}

function Assert-Equals {
    param([string]$Name, [AllowNull()][string]$Actual, [string]$Expected)
    if ($Actual -ne $Expected) { throw "$Name doit valoir $Expected" }
}

function Assert-SecretPresent {
    param([string]$Name)
    if (Test-Placeholder (Get-EnvValue $Name)) { throw "$Name est absent ou contient un placeholder (valeur masquee)" }
}

function Invoke-StagingCompose {
    param([Parameter(ValueFromRemainingArguments = $true)][string[]]$Arguments)
    & docker compose --env-file $envPath -f $composeFile @Arguments
    Assert-LastExitCode 'Docker Compose a echoue'
}

Write-Host "Preflight $Environment Logistics School - aucune ressource cloud et aucun deploiement" -ForegroundColor Yellow

Invoke-Check 'Configuration locale presente' {
    if (-not (Test-Path -LiteralPath $envPath)) { throw "$envPath est absent" }
    if (-not (Test-Path -LiteralPath $composeFile) -and $Environment -eq 'staging') { throw 'docker-compose.staging.yml est absent' }
}

Invoke-Check 'Etat Git en lecture seule' {
    Push-Location $projectRoot
    try {
        git branch --show-current
        git status --short
        Assert-LastExitCode 'Impossible de lire Git'
    } finally { Pop-Location }
}

Invoke-Check 'Variables communes sans exposition de secrets' {
    Assert-Equals 'APP_ENV' (Get-EnvValue 'APP_ENV') $Environment
    Assert-Equals 'APP_DEBUG' (Get-EnvValue 'APP_DEBUG') 'false'
    Assert-SecretPresent 'APP_KEY'
    Assert-SecretPresent 'DB_PASSWORD'
    Assert-SecretPresent 'REVERB_APP_ID'
    Assert-SecretPresent 'REVERB_APP_KEY'
    Assert-SecretPresent 'REVERB_APP_SECRET'

    $appUrl = [uri](Get-EnvValue 'APP_URL')
    $frontendUrl = [uri](Get-EnvValue 'FRONTEND_URL')
    if ($appUrl.Scheme -ne 'https' -or $frontendUrl.Scheme -ne 'https') { throw 'APP_URL et FRONTEND_URL doivent utiliser HTTPS' }
    if ($Environment -eq 'production' -and ($appUrl.Host.EndsWith('.local') -or $frontendUrl.Host.EndsWith('.local'))) {
        throw 'Les domaines .local sont interdits en production'
    }

    Assert-Equals 'SESSION_SECURE_COOKIE' (Get-EnvValue 'SESSION_SECURE_COOKIE') 'true'
    Assert-Equals 'SESSION_HTTP_ONLY' (Get-EnvValue 'SESSION_HTTP_ONLY') 'true'
    Assert-Equals 'SESSION_SAME_SITE' (Get-EnvValue 'SESSION_SAME_SITE') 'lax'
    Assert-Equals 'SESSION_DRIVER' (Get-EnvValue 'SESSION_DRIVER') 'database'
    Assert-Equals 'DB_CONNECTION' (Get-EnvValue 'DB_CONNECTION') 'mysql'

    $cors = (Get-EnvValue 'CORS_ALLOWED_ORIGINS') -split ',' | ForEach-Object { $_.Trim().TrimEnd('/') }
    if ($cors -contains '*' -or $cors -notcontains $frontendUrl.AbsoluteUri.TrimEnd('/')) {
        throw 'CORS_ALLOWED_ORIGINS doit etre explicite et inclure FRONTEND_URL'
    }
    $sanctum = (Get-EnvValue 'SANCTUM_STATEFUL_DOMAINS') -split ',' | ForEach-Object { $_.Trim() }
    if ($sanctum -contains '*' -or $sanctum -notcontains $frontendUrl.Authority) {
        throw 'SANCTUM_STATEFUL_DOMAINS doit inclure le host frontend sans schema'
    }
    $sessionDomain = (Get-EnvValue 'SESSION_DOMAIN').TrimStart('.')
    if (-not $appUrl.Host.EndsWith($sessionDomain) -or -not $frontendUrl.Host.EndsWith($sessionDomain)) {
        throw 'SESSION_DOMAIN ne couvre pas les deux origins'
    }
    $reverbOrigins = (Get-EnvValue 'REVERB_ALLOWED_ORIGINS') -split ',' | ForEach-Object { $_.Trim() }
    if ($reverbOrigins -contains '*' -or $reverbOrigins -notcontains $frontendUrl.Host) {
        throw 'REVERB_ALLOWED_ORIGINS doit contenir le host frontend, sans schema, et ne doit pas utiliser *'
    }

    Assert-Equals 'MAIL_MAILER' (Get-EnvValue 'MAIL_MAILER') 'smtp'
    if (Test-Placeholder (Get-EnvValue 'MAIL_HOST')) { throw 'MAIL_HOST est absent ou invalide' }
    if ($Environment -eq 'production') {
        if ((Get-EnvValue 'MAIL_HOST') -eq 'mailpit') { throw 'Mailpit est interdit comme SMTP production' }
        Assert-SecretPresent 'MAIL_USERNAME'
        Assert-SecretPresent 'MAIL_PASSWORD'
    }

    if ((Get-EnvValue 'PHONE_VERIFICATION_ENABLED') -eq 'true') {
        throw 'La verification telephone doit rester desactivee tant qu aucun provider implemente et valide n est disponible'
    }
    Assert-Equals 'PHONE_VERIFICATION_DRIVER' (Get-EnvValue 'PHONE_VERIFICATION_DRIVER') 'fail_closed'
    Assert-Equals 'BROADCAST_CONNECTION' (Get-EnvValue 'BROADCAST_CONNECTION') 'reverb'
    Assert-Equals 'REVERB_SCHEME' (Get-EnvValue 'REVERB_SCHEME') 'https'
    Assert-Equals 'REVERB_INTERNAL_SCHEME' (Get-EnvValue 'REVERB_INTERNAL_SCHEME') 'http'
    if (Test-Placeholder (Get-EnvValue 'REVERB_INTERNAL_HOST')) { throw 'REVERB_INTERNAL_HOST est absent' }
    if ($Environment -eq 'staging') {
        Assert-Equals 'REVERB_INTERNAL_HOST' (Get-EnvValue 'REVERB_INTERNAL_HOST') 'reverb'
        Assert-Equals 'REVERB_INTERNAL_PORT' (Get-EnvValue 'REVERB_INTERNAL_PORT') '8080'
        Assert-Equals 'VITE_REVERB_SCHEME' (Get-EnvValue 'VITE_REVERB_SCHEME') 'https'
    }
    Assert-Equals 'QUEUE_CONNECTION' (Get-EnvValue 'QUEUE_CONNECTION') 'database'
    Assert-Equals 'CACHE_STORE' (Get-EnvValue 'CACHE_STORE') 'database'

    if (Test-Placeholder (Get-EnvValue 'BACKUP_PATH')) { throw 'BACKUP_PATH est absent' }
    $retention = 0
    if (-not [int]::TryParse((Get-EnvValue 'BACKUP_RETENTION_DAYS'), [ref]$retention) -or $retention -lt 1) {
        throw 'BACKUP_RETENTION_DAYS doit etre un entier positif'
    }
    Write-Host 'Secrets presents, domaines/cookies/CORS/DB/mail/SMS/Reverb/queue/backup coherents; valeurs sensibles masquees.'
}

if ($Environment -eq 'staging') {
    Invoke-Check 'Docker et configuration Compose staging' {
        if (-not (Get-Command docker -ErrorAction SilentlyContinue)) { throw 'docker est introuvable' }
        docker version --format '{{.Server.Version}}' | Out-Null
        Assert-LastExitCode 'Le moteur Docker ne repond pas'
        Invoke-StagingCompose config --quiet
        $rendered = & docker compose --env-file $envPath -f $composeFile config
        Assert-LastExitCode 'Impossible de rendre Compose'
        if ($rendered -match '(?m)^\s*-?\s*3306:3306\s*$') { throw 'MySQL ne doit pas publier le port 3306' }
        if ($rendered -match 'docker\.sock|privileged:\s*true') { throw 'Configuration Docker privilegiee interdite' }
    }

    Invoke-Check 'Espace disque et chemins locaux' {
        $drive = Get-PSDrive -Name ([System.IO.Path]::GetPathRoot($projectRoot).TrimEnd(':\'))
        if ($drive.Free -lt 2GB) { throw 'Moins de 2 GiB libres sur le disque du projet' }
        $backupPath = Join-Path $projectRoot (Get-EnvValue 'BACKUP_PATH')
        if (-not (Test-Path -LiteralPath $backupPath)) { throw 'Le dossier de backup versionne par son .gitignore est absent' }
        Write-Host ("Espace disque libre: {0:N1} GiB" -f ($drive.Free / 1GB))
    }

    if ($RequireRunning) {
        Invoke-Check 'Services staging et healthchecks Docker' {
            $required = @('mysql', 'backend', 'frontend', 'reverb', 'queue', 'scheduler', 'mailpit', 'reverse-proxy')
            $running = & docker compose --env-file $envPath -f $composeFile ps --services --filter status=running
            Assert-LastExitCode 'Impossible de lire les services'
            foreach ($service in $required) {
                if ($running -notcontains $service) { throw "Service non actif: $service" }
            }
            $notHealthy = @()
            foreach ($service in $required) {
                $containerId = & docker compose --env-file $envPath -f $composeFile ps -q $service
                Assert-LastExitCode "Impossible de trouver le conteneur $service"
                if (-not $containerId) { $notHealthy += "$service(absent)"; continue }
                $health = & docker inspect --format '{{if .State.Health}}{{.State.Health.Status}}{{else}}{{.State.Status}}{{end}}' $containerId
                Assert-LastExitCode "Impossible de lire le healthcheck $service"
                if ($health -ne 'healthy') { $notHealthy += "$service($health)" }
            }
            if ($notHealthy.Count -gt 0) { throw "Service(s) non healthy: $($notHealthy -join ', ')" }
            Invoke-StagingCompose ps
        }

        Invoke-Check 'MySQL, migrations, caches Laravel et scheduler' {
            Invoke-StagingCompose exec -T backend php artisan migrate:status --no-ansi
            $migrationStatus = & docker compose --env-file $envPath -f $composeFile exec -T backend php artisan migrate:status --no-ansi
            Assert-LastExitCode 'Impossible de lire les migrations'
            if ($migrationStatus -match '\bPending\b') { throw 'Des migrations MySQL sont Pending' }
            Invoke-StagingCompose exec -T backend php artisan config:cache --no-ansi
            Invoke-StagingCompose exec -T backend php artisan route:cache --no-ansi
            Invoke-StagingCompose exec -T backend php artisan view:cache --no-ansi
            Invoke-StagingCompose exec -T scheduler php artisan schedule:list --no-ansi
        }

        Invoke-Check 'HTTPS public minimal et readiness' {
            $frontendHost = Get-EnvValue 'STAGING_FRONTEND_HOST'
            $apiHost = Get-EnvValue 'STAGING_API_HOST'
            $httpsPort = Get-EnvValue 'STAGING_HTTPS_PORT'
            curl.exe --silent --show-error --fail --insecure --resolve "${frontendHost}:${httpsPort}:127.0.0.1" "https://${frontendHost}:${httpsPort}/" | Out-Null
            Assert-LastExitCode 'Frontend HTTPS indisponible'
            $health = curl.exe --silent --show-error --fail --insecure --resolve "${apiHost}:${httpsPort}:127.0.0.1" "https://${apiHost}:${httpsPort}/api/health"
            Assert-LastExitCode 'Health backend indisponible'
            if ($health -ne '{"status":"ok"}') { throw 'Le health public ne respecte pas le contrat minimal' }
            $ready = curl.exe --silent --show-error --fail --insecure --resolve "${apiHost}:${httpsPort}:127.0.0.1" "https://${apiHost}:${httpsPort}/api/health/ready"
            Assert-LastExitCode 'Readiness backend indisponible'
            if ($ready -ne '{"status":"ok"}') { throw 'Readiness en echec' }
        }
    }
}

if (-not $SkipTests) {
    Invoke-Check 'Suite backend verrouillee' {
        $mount = "$backendRoot`:/app"
        docker run --rm --volume $mount --workdir /app composer:2.8 validate --strict --no-check-publish
        Assert-LastExitCode 'composer validate a echoue'
        docker run --rm --volume $mount --workdir /app composer:2.8 audit --locked
        Assert-LastExitCode 'composer audit a echoue'
        docker run --rm --volume $mount --workdir /app --entrypoint php composer:2.8 vendor/bin/pint --test
        Assert-LastExitCode 'Pint a echoue'
        docker run --rm --volume $mount --workdir /app --entrypoint php composer:2.8 vendor/bin/phpstan analyse --memory-limit=1G
        Assert-LastExitCode 'PHPStan a echoue'
        docker run --rm --volume $mount --workdir /app --entrypoint php composer:2.8 artisan test
        Assert-LastExitCode 'Tests backend en echec'
    }

    Invoke-Check 'Suite frontend verrouillee' {
        Push-Location $frontendRoot
        try {
            npm.cmd ci
            Assert-LastExitCode 'npm ci a echoue'
            npm.cmd audit --audit-level=high
            Assert-LastExitCode 'npm audit a echoue'
            npm.cmd run lint
            Assert-LastExitCode 'lint a echoue'
            npm.cmd run typecheck
            Assert-LastExitCode 'typecheck a echoue'
            npm.cmd test -- --run
            Assert-LastExitCode 'tests frontend en echec'
            npm.cmd run build
            Assert-LastExitCode 'build frontend en echec'
            npm.cmd run test:e2e
            Assert-LastExitCode 'E2E frontend en echec'
        } finally { Pop-Location }
    }
}

if ($script:failures -gt 0) {
    Write-Host "`nPREFLIGHT EN ECHEC: $script:failures controle(s) non valide(s)." -ForegroundColor Red
    exit 1
}

Write-Host "`nPREFLIGHT $($Environment.ToUpperInvariant()) REUSSI. Aucun deploiement cloud n'a ete effectue." -ForegroundColor Green
exit 0
