[CmdletBinding()]
param()

$ErrorActionPreference = 'Stop'
$projectRoot = Split-Path -Parent $PSScriptRoot
$envPath = Join-Path $projectRoot '.env.staging'
$composeFile = Join-Path $projectRoot 'docker-compose.staging.yml'
$cookieJar = Join-Path ([System.IO.Path]::GetTempPath()) ("logistics-smoke-" + [guid]::NewGuid().ToString('N') + '.cookies')

function Get-EnvValue {
    param([string]$Name)
    $match = Select-String -LiteralPath $envPath -Pattern "^$([regex]::Escape($Name))=(.*)$" | Select-Object -First 1
    if (-not $match) { return $null }
    return $match.Matches[0].Groups[1].Value.Trim().Trim('"').Trim("'")
}

function Invoke-CurlJson {
    param([string]$Method, [string]$Path, [AllowNull()][string]$Json, [switch]$Csrf)
    $hostName = Get-EnvValue 'STAGING_API_HOST'
    $port = Get-EnvValue 'STAGING_HTTPS_PORT'
    $arguments = @('--silent', '--show-error', '--insecure', '--resolve', "${hostName}:${port}:127.0.0.1", '--cookie', $cookieJar, '--cookie-jar', $cookieJar, '--request', $Method, '--header', 'Accept: application/json', '--header', 'Origin: https://logistics.local', '--write-out', "`n%{http_code}", "https://${hostName}:${port}${Path}")
    if ($Csrf) {
        $csrfLine = Get-Content -LiteralPath $cookieJar | Where-Object { $_ -match "`tXSRF-TOKEN`t" } | Select-Object -Last 1
        if (-not $csrfLine) { throw 'XSRF cookie is missing.' }
        $token = [uri]::UnescapeDataString(($csrfLine -split "`t")[-1])
        $arguments += @('--header', "X-XSRF-TOKEN: $token")
    }
    if ($null -ne $Json) {
        $arguments += @('--header', 'Content-Type: application/json', '--data-binary', '@-')
        $raw = $Json | & curl.exe @arguments
    } else {
        $raw = & curl.exe @arguments
    }
    if ($LASTEXITCODE -ne 0) { throw "HTTP request failed for $Path" }
    $lines = @($raw)
    $status = [int]$lines[-1]
    $body = ($lines[0..([Math]::Max(0, $lines.Count - 2))] -join "`n")
    return @{ Status = $status; Body = $body }
}

if (-not (Test-Path -LiteralPath $envPath)) { throw '.env.staging is missing.' }
$email = Get-EnvValue 'STAGING_TEST_EMAIL'
$password = Get-EnvValue 'STAGING_TEST_PASSWORD'
if ([string]::IsNullOrWhiteSpace($password) -or $password -match 'CHANGE_ME') { throw 'STAGING_TEST_PASSWORD is not configured.' }

try {
    $frontendHost = Get-EnvValue 'STAGING_FRONTEND_HOST'
    $port = Get-EnvValue 'STAGING_HTTPS_PORT'
    curl.exe --silent --show-error --fail --insecure --resolve "${frontendHost}:${port}:127.0.0.1" "https://${frontendHost}:${port}/" | Out-Null
    if ($LASTEXITCODE -ne 0) { throw 'Frontend HTTPS check failed.' }

    $health = Invoke-CurlJson GET '/api/health' $null
    if ($health.Status -ne 200 -or $health.Body -ne '{"status":"ok"}') { throw 'Backend health contract failed.' }

    $csrf = Invoke-CurlJson GET '/sanctum/csrf-cookie' $null
    if ($csrf.Status -ne 204) { throw 'Sanctum CSRF endpoint failed.' }

    $loginPayload = @{ email = $email; password = $password } | ConvertTo-Json -Compress
    $login = Invoke-CurlJson POST '/api/auth/login' $loginPayload -Csrf
    if ($login.Status -ne 200) { throw 'Staging test login failed.' }

    $me = Invoke-CurlJson GET '/api/auth/me' $null
    if ($me.Status -ne 200) { throw 'Authenticated /me failed.' }

    $mutation = Invoke-CurlJson PATCH '/api/auth/me' '{"city":"Casablanca"}' -Csrf
    if ($mutation.Status -ne 200) { throw 'Protected mutation failed.' }

    docker compose --env-file $envPath -f $composeFile exec -T mysql sh -c 'export MYSQL_PWD="$MYSQL_PASSWORD"; mysqladmin ping --silent --host=127.0.0.1 --user="$MYSQL_USER"'
    if ($LASTEXITCODE -ne 0) { throw 'MySQL ping failed.' }

    $reverbKey = Get-EnvValue 'REVERB_APP_KEY'
    $websocketCode = curl.exe --silent --output NUL --insecure --max-time 3 --http1.1 --resolve "api.logistics.local:${port}:127.0.0.1" --header 'Connection: Upgrade' --header 'Upgrade: websocket' --header 'Sec-WebSocket-Version: 13' --header 'Sec-WebSocket-Key: dGhlIHNhbXBsZSBub25jZQ==' --write-out '%{http_code}' "https://api.logistics.local:${port}/app/${reverbKey}?protocol=7&client=smoke&version=1.0&flash=false"
    if ($websocketCode -ne '101') { throw "WSS upgrade failed with HTTP $websocketCode" }

    $logout = Invoke-CurlJson POST '/api/auth/logout' '{}' -Csrf
    if ($logout.Status -ne 200) { throw 'Logout failed.' }
    $afterLogout = Invoke-CurlJson GET '/api/auth/me' $null
    if ($afterLogout.Status -ne 401) { throw 'Session remained authenticated after logout.' }

    Write-Host 'Smoke test passed: HTTPS frontend, health, CSRF, login, /me, protected mutation, MySQL, WSS and logout.' -ForegroundColor Green
} finally {
    if (Test-Path -LiteralPath $cookieJar) { Remove-Item -LiteralPath $cookieJar -Force }
}
