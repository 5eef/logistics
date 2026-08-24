[CmdletBinding()]
param()

$ErrorActionPreference = 'Stop'
$projectRoot = Split-Path -Parent $PSScriptRoot
$envPath = Join-Path $projectRoot '.env.staging'
$frontendRoot = Join-Path $projectRoot 'frontend'

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

try {
    Push-Location $frontendRoot
    try {
        npm.cmd run test:e2e:staging
        if ($LASTEXITCODE -ne 0) { throw 'Integrated staging Playwright suite failed.' }
    } finally { Pop-Location }
} finally {
    Remove-Item Env:STAGING_TEST_PASSWORD -ErrorAction SilentlyContinue
    Remove-Item Env:STAGING_FRONTEND_URL -ErrorAction SilentlyContinue
    Remove-Item Env:STAGING_API_URL -ErrorAction SilentlyContinue
}
