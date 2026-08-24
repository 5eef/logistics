[CmdletBinding()]
param()

$ErrorActionPreference = 'Stop'
$projectRoot = Split-Path -Parent $PSScriptRoot
$frontendRoot = Join-Path $projectRoot 'frontend'
$envPath = Join-Path $projectRoot '.env.staging'
$composeFile = Join-Path $projectRoot 'docker-compose.staging.yml'

function Get-EnvValue {
    param([string]$Name)
    $match = Select-String -LiteralPath $envPath -Pattern "^$([regex]::Escape($Name))=(.*)$" | Select-Object -First 1
    if (-not $match) { return $null }
    return $match.Matches[0].Groups[1].Value.Trim().Trim('"').Trim("'")
}

if (-not (Test-Path -LiteralPath $envPath)) { throw '.env.staging is missing.' }
$env:STAGING_TEST_PASSWORD = Get-EnvValue 'STAGING_TEST_PASSWORD'
$env:STAGING_FRONTEND_URL = Get-EnvValue 'FRONTEND_URL'
$env:STAGING_API_URL = Get-EnvValue 'APP_URL'
$env:STAGING_EXPECT_POLLING_FALLBACK = 'true'

try {
    docker compose --env-file $envPath -f $composeFile stop reverb
    if ($LASTEXITCODE -ne 0) { throw 'Unable to stop Reverb for the controlled fallback test.' }
    Push-Location $frontendRoot
    try {
        npm.cmd run test:e2e:staging -- --grep 'polling fallback'
        if ($LASTEXITCODE -ne 0) { throw 'Browser polling fallback test failed.' }
    } finally { Pop-Location }
} finally {
    docker compose --env-file $envPath -f $composeFile start reverb | Out-Null
    for ($attempt = 0; $attempt -lt 30; $attempt++) {
        $containerId = docker compose --env-file $envPath -f $composeFile ps -q reverb
        $health = if ($containerId) { docker inspect --format '{{.State.Health.Status}}' $containerId 2>$null } else { '' }
        if ($health -eq 'healthy') { break }
        Start-Sleep -Seconds 2
    }
    docker compose --env-file $envPath -f $composeFile exec -T backend php artisan queue:retry all --no-ansi | Out-Null
    Remove-Item Env:STAGING_TEST_PASSWORD,Env:STAGING_FRONTEND_URL,Env:STAGING_API_URL,Env:STAGING_EXPECT_POLLING_FALLBACK -ErrorAction SilentlyContinue
}

if ($health -ne 'healthy') { throw 'Reverb did not recover after the fallback test.' }
for ($attempt = 0; $attempt -lt 30; $attempt++) {
    $remaining = 'SELECT COUNT(*) FROM jobs;' | docker compose --env-file $envPath -f $composeFile exec -T mysql sh -c 'MYSQL_PWD="$MYSQL_PASSWORD" mysql --batch --skip-column-names --user="$MYSQL_USER" "$MYSQL_DATABASE"' 2>$null
    if ([int]$remaining -eq 0) { break }
    Start-Sleep -Seconds 1
}
if ([int]$remaining -ne 0) { throw 'Broadcast jobs did not drain after Reverb recovery.' }
$failed = docker compose --env-file $envPath -f $composeFile exec -T backend php artisan queue:failed --no-ansi
$failedText = $failed -join "`n"
if ($LASTEXITCODE -ne 0 -or $failedText -notmatch 'No failed jobs found') { throw 'A failed job remained after Reverb recovery.' }
Write-Host 'Realtime fallback passed: browser polling delivered the notification while Reverb was down, then Reverb recovered with an empty queue.' -ForegroundColor Green
