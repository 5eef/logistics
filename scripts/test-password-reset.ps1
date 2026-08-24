[CmdletBinding()]
param()

$ErrorActionPreference = 'Stop'
$projectRoot = Split-Path -Parent $PSScriptRoot
$envPath = Join-Path $projectRoot '.env.staging'
$composeFile = Join-Path $projectRoot 'docker-compose.staging.yml'
$cookieJar = Join-Path ([System.IO.Path]::GetTempPath()) ("logistics-reset-" + [guid]::NewGuid().ToString('N') + '.cookies')

function Get-EnvValue {
    param([string]$Name)
    $match = Select-String -LiteralPath $envPath -Pattern "^$([regex]::Escape($Name))=(.*)$" | Select-Object -First 1
    if (-not $match) { return $null }
    return $match.Matches[0].Groups[1].Value.Trim().Trim('"').Trim("'")
}

function Invoke-Api {
    param([string]$Method, [string]$Path, [AllowNull()][string]$Json, [switch]$Csrf)
    $arguments = @('--silent', '--show-error', '--insecure', '--resolve', 'api.logistics.local:443:127.0.0.1', '--cookie', $cookieJar, '--cookie-jar', $cookieJar, '--request', $Method, '--header', 'Accept: application/json', '--header', 'Origin: https://logistics.local', '--write-out', "`n%{http_code}", "https://api.logistics.local${Path}")
    if ($Csrf) {
        $line = Get-Content -LiteralPath $cookieJar | Where-Object { $_ -match "`tXSRF-TOKEN`t" } | Select-Object -Last 1
        if (-not $line) { throw 'XSRF cookie is missing.' }
        $arguments += @('--header', ('X-XSRF-TOKEN: ' + [uri]::UnescapeDataString(($line -split "`t")[-1])))
    }
    if ($null -ne $Json) {
        $arguments += @('--header', 'Content-Type: application/json', '--data-binary', '@-')
        $raw = $Json | & curl.exe @arguments
    } else { $raw = & curl.exe @arguments }
    if ($LASTEXITCODE -ne 0) { throw "HTTP request failed for $Path" }
    $lines = @($raw)
    return @{ Status = [int]$lines[-1]; Body = ($lines[0..([Math]::Max(0, $lines.Count - 2))] -join "`n") }
}

if (-not (Test-Path -LiteralPath $envPath)) { throw '.env.staging is missing.' }
$email = Get-EnvValue 'STAGING_TEST_EMAIL'
$oldPassword = Get-EnvValue 'STAGING_TEST_PASSWORD'
$newPassword = Get-EnvValue 'STAGING_TEST_NEW_PASSWORD'
$mailHost = Get-EnvValue 'STAGING_MAIL_HOST'
if ([string]::IsNullOrWhiteSpace($mailHost)) { $mailHost = 'mail.logistics.local' }
$mailCurl = @('--silent', '--show-error', '--fail', '--insecure', '--resolve', "${mailHost}:443:127.0.0.1")
if ($oldPassword -match 'CHANGE_ME' -or $newPassword -match 'CHANGE_ME') { throw 'Staging reset passwords are not configured.' }

try {
    & curl.exe @mailCurl --request DELETE "https://${mailHost}/api/v1/messages" | Out-Null
    if ($LASTEXITCODE -ne 0) { throw 'Mailpit API is unavailable.' }
    $csrf = Invoke-Api GET '/sanctum/csrf-cookie' $null
    if ($csrf.Status -ne 204) { throw 'Unable to initialize CSRF.' }
    $forgot = Invoke-Api POST '/api/auth/forgot-password' (@{ email = $email } | ConvertTo-Json -Compress) -Csrf
    if ($forgot.Status -ne 200) { throw 'Forgot-password request failed.' }

    $messageId = $null
    for ($attempt = 0; $attempt -lt 20 -and -not $messageId; $attempt++) {
        Start-Sleep -Milliseconds 500
        $search = & curl.exe @mailCurl --get --data-urlencode "query=to:$email" "https://${mailHost}/api/v1/search" | ConvertFrom-Json
        if ($LASTEXITCODE -ne 0) { throw 'Mailpit search failed.' }
        $messageId = $search.messages | Select-Object -First 1 -ExpandProperty ID
    }
    if (-not $messageId) { throw 'Password reset email was not received by Mailpit.' }

    $message = & curl.exe @mailCurl "https://${mailHost}/api/v1/message/$messageId" | ConvertFrom-Json
    if ($LASTEXITCODE -ne 0) { throw 'Unable to read Mailpit message.' }
    $content = [System.Net.WebUtility]::HtmlDecode(($message.HTML + "`n" + $message.Text))
    $match = [regex]::Match($content, 'https://logistics\.local/reset-password\?token=([^&\s"''<]+)&email=([^\s"''<]+)')
    if (-not $match.Success) { throw 'The email does not contain the expected HTTPS React reset link.' }
    $token = [uri]::UnescapeDataString($match.Groups[1].Value)
    $linkEmail = [uri]::UnescapeDataString($match.Groups[2].Value.TrimEnd('>', ')', '.'))
    if ($linkEmail -ne $email) { throw 'Reset link targets an unexpected account.' }

    $payload = @{ token = $token; email = $email; password = $newPassword; password_confirmation = $newPassword } | ConvertTo-Json -Compress
    $reset = Invoke-Api POST '/api/auth/reset-password' $payload -Csrf
    if ($reset.Status -ne 200) { throw 'Password reset endpoint rejected the Mailpit token.' }
    $login = Invoke-Api POST '/api/auth/login' (@{ email = $email; password = $newPassword } | ConvertTo-Json -Compress) -Csrf
    if ($login.Status -ne 200) { throw 'Login with the new password failed.' }

    Write-Host 'Password reset passed end-to-end through Laravel, SMTP, Mailpit, the HTTPS React link and login.' -ForegroundColor Green
} finally {
    if (Test-Path -LiteralPath $cookieJar) { Remove-Item -LiteralPath $cookieJar -Force }
    docker compose --env-file $envPath -f $composeFile exec -T backend php artisan db:seed '--class=Database\Seeders\StagingSeeder' --force --no-interaction | Out-Null
}
