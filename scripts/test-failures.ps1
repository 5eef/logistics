[CmdletBinding()]
param()

$ErrorActionPreference = 'Stop'
$projectRoot = Split-Path -Parent $PSScriptRoot
$envPath = Join-Path $projectRoot '.env.staging'
$composeFile = Join-Path $projectRoot 'docker-compose.staging.yml'

if (-not (Test-Path -LiteralPath $envPath)) { throw '.env.staging is missing.' }

function Invoke-Compose {
    param([Parameter(ValueFromRemainingArguments = $true)][string[]]$Arguments)
    & docker compose --env-file $envPath -f $composeFile @Arguments
    if ($LASTEXITCODE -ne 0) { throw "Docker Compose failed: $($Arguments -join ' ')" }
}

function Get-HttpResult {
    param([string]$Path)
    $body = & curl.exe --silent --show-error --insecure --resolve 'api.logistics.local:443:127.0.0.1' --write-out "`n%{http_code}" "https://api.logistics.local$Path"
    $status = [int]$body[-1]
    [pscustomobject]@{ Status = $status; Body = ($body[0..($body.Count - 2)] -join "`n") }
}

function Wait-Healthy {
    param([string]$Service, [int]$Attempts = 40)
    for ($attempt = 0; $attempt -lt $Attempts; $attempt++) {
        $containerId = & docker compose --env-file $envPath -f $composeFile ps -q $Service
        if ($containerId) {
            $health = & docker inspect --format '{{if .State.Health}}{{.State.Health.Status}}{{else}}{{.State.Status}}{{end}}' $containerId 2>$null
            if ($health -eq 'healthy' -or $health -eq 'running') { return }
        }
        Start-Sleep -Seconds 2
    }
    throw "$Service did not recover"
}

Write-Host 'Controlled local staging failure checks; every stopped service is restarted.' -ForegroundColor Yellow

try {
    Invoke-Compose stop mysql
    $ready = Get-HttpResult '/api/health/ready'
    if ($ready.Status -ne 503 -or $ready.Body -match '(?i)exception|stack|trace|sqlstate') {
        throw 'Readiness did not fail safely while MySQL was stopped.'
    }
    Write-Host 'OK: MySQL outage returns a minimal 503 readiness response.' -ForegroundColor Green
} finally {
    Invoke-Compose start mysql
    Wait-Healthy mysql
}

try {
    Invoke-Compose stop reverb
    $health = Get-HttpResult '/api/health'
    if ($health.Status -ne 200 -or $health.Body -ne '{"status":"ok"}') { throw 'The API became unavailable without Reverb.' }
    Write-Host 'OK: API remains usable while Reverb is stopped; the SPA polling fallback remains available.' -ForegroundColor Green
} finally {
    Invoke-Compose start reverb
    Wait-Healthy reverb
}

try {
    Invoke-Compose stop mailpit
    $mailStatus = & curl.exe --silent --insecure --resolve 'api.logistics.local:443:127.0.0.1' --output NUL --write-out '%{http_code}' `
        --header 'Accept: application/json' --header 'Content-Type: application/json' `
        --data '{"email":"staging.sender@example.test"}' 'https://api.logistics.local/api/auth/forgot-password'
    if ([int]$mailStatus -lt 400) { throw 'The mail request unexpectedly succeeded while SMTP was unavailable.' }
    $health = Get-HttpResult '/api/health'
    if ($health.Status -ne 200) { throw 'The API did not remain healthy after an SMTP failure.' }
    Write-Host 'OK: SMTP failure is isolated and the API remains healthy.' -ForegroundColor Green
} finally {
    Invoke-Compose start mailpit
    Wait-Healthy mailpit
}

try {
    Invoke-Compose stop --timeout 5 queue
    $probe = "require 'vendor/autoload.php'; `$app=require 'bootstrap/app.php'; `$app->make(Illuminate\Contracts\Console\Kernel::class)->bootstrap(); `$user=App\Models\User::where('email','staging.sender@example.test')->firstOrFail(); App\Models\Notification::create(['user_id'=>`$user->id,'title'=>'Staging queue probe','message'=>'Fictitious controlled failure test','type'=>'info']);"
    Invoke-Compose exec -T backend php -r $probe
    $count = 'SELECT COUNT(*) FROM jobs;' | docker compose --env-file $envPath -f $composeFile exec -T mysql sh -c 'MYSQL_PWD="$MYSQL_PASSWORD" mysql --batch --skip-column-names --user="$MYSQL_USER" "$MYSQL_DATABASE"' 2>$null
    if ([int]$count -lt 1) { throw 'No queued job remained while the worker was stopped.' }
    Write-Host 'OK: queued work remains persisted while the worker is stopped.' -ForegroundColor Green
} finally {
    Invoke-Compose start queue
    Wait-Healthy queue
}

for ($attempt = 0; $attempt -lt 30; $attempt++) {
    $remaining = 'SELECT COUNT(*) FROM jobs;' | docker compose --env-file $envPath -f $composeFile exec -T mysql sh -c 'MYSQL_PWD="$MYSQL_PASSWORD" mysql --batch --skip-column-names --user="$MYSQL_USER" "$MYSQL_DATABASE"' 2>$null
    if ([int]$remaining -eq 0) { break }
    Start-Sleep -Seconds 1
}
if ([int]$remaining -ne 0) { throw 'The queue did not drain after worker recovery.' }
Write-Host 'OK: queue recovered and drained persisted work.' -ForegroundColor Green

Write-Host 'CONTROLLED FAILURE CHECKS PASSED.' -ForegroundColor Green
