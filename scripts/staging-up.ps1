[CmdletBinding()]
param(
    [switch]$SeedTestData,
    [int]$TimeoutSeconds = 300
)

$ErrorActionPreference = 'Stop'
$projectRoot = Split-Path -Parent $PSScriptRoot
$envPath = Join-Path $projectRoot '.env.staging'
$composeFile = Join-Path $projectRoot 'docker-compose.staging.yml'

if (-not (Test-Path -LiteralPath $envPath)) {
    throw 'Run scripts/init-staging.ps1 first. staging-up never creates secrets automatically.'
}

& (Join-Path $PSScriptRoot 'preflight.ps1') -Environment staging -SkipTests
if ($LASTEXITCODE -ne 0) { throw 'Staging preflight failed before startup.' }

Push-Location $projectRoot
try {
    docker compose --env-file $envPath -f $composeFile up -d --build --remove-orphans
    if ($LASTEXITCODE -ne 0) { throw 'Docker Compose startup failed.' }

    if ($SeedTestData) {
        docker compose --env-file $envPath -f $composeFile exec -T backend php artisan db:seed '--class=Database\Seeders\StagingSeeder' --force --no-interaction
        if ($LASTEXITCODE -ne 0) { throw 'Fictitious staging seed failed.' }
    }

    $required = @('mysql', 'backend', 'frontend', 'reverb', 'queue', 'scheduler', 'mailpit', 'reverse-proxy')
    $deadline = (Get-Date).AddSeconds($TimeoutSeconds)
    do {
        $running = docker compose --env-file $envPath -f $composeFile ps --services --filter status=running
        if ($LASTEXITCODE -ne 0) { throw 'Unable to inspect staging containers.' }
        $notReady = @($required | Where-Object { $running -notcontains $_ } | ForEach-Object { "$_(not-running)" })
        foreach ($service in $required | Where-Object { $running -contains $_ }) {
            $containerId = docker compose --env-file $envPath -f $composeFile ps -q $service
            if ($LASTEXITCODE -ne 0 -or -not $containerId) { $notReady += "$service(absent)"; continue }
            $health = docker inspect --format '{{if .State.Health}}{{.State.Health.Status}}{{else}}{{.State.Status}}{{end}}' $containerId 2>$null
            if ($health -ne 'healthy') { $notReady += "$service($health)" }
        }
        if ($notReady.Count -eq 0) { break }
        Start-Sleep -Seconds 3
    } while ((Get-Date) -lt $deadline)

    if ($notReady.Count -gt 0) {
        docker compose --env-file $envPath -f $composeFile ps
        throw "Services not ready before timeout: $($notReady -join ', ')"
    }

    & (Join-Path $PSScriptRoot 'preflight.ps1') -Environment staging -RequireRunning -SkipTests
    if ($LASTEXITCODE -ne 0) { throw 'Running staging preflight failed.' }

    Write-Host 'Local production-like staging is ready:' -ForegroundColor Green
    Write-Host '  Frontend: https://logistics.local'
    Write-Host '  API:      https://api.logistics.local'
    Write-Host '  Mailpit:  https://mail.logistics.local'
    Write-Host 'The local Caddy CA is intentionally not trusted automatically. See docs/STAGING.md.'
} finally {
    Pop-Location
}
