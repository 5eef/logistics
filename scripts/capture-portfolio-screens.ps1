[CmdletBinding()]
param()

$ErrorActionPreference = 'Stop'
$projectRoot = Split-Path -Parent $PSScriptRoot
$envPath = Join-Path $projectRoot '.env.staging'
$frontendRoot = Join-Path $projectRoot 'frontend'
$screenshotsRoot = Join-Path $projectRoot 'docs\screenshots'

function Get-EnvValue {
    param([string]$Name)
    $match = Select-String -LiteralPath $envPath -Pattern "^$([regex]::Escape($Name))=(.*)$" | Select-Object -First 1
    if (-not $match) { return $null }
    return $match.Matches[0].Groups[1].Value.Trim().Trim('"').Trim("'")
}

if (-not (Test-Path -LiteralPath $envPath)) { throw '.env.staging is missing.' }
if (-not (Test-Path -LiteralPath (Join-Path $frontendRoot 'node_modules\@playwright\test'))) {
    throw 'Frontend dependencies are missing. Run npm ci in frontend first.'
}

New-Item -ItemType Directory -Path $screenshotsRoot -Force | Out-Null
$env:STAGING_TEST_PASSWORD = Get-EnvValue 'STAGING_TEST_PASSWORD'
$env:STAGING_FRONTEND_URL = Get-EnvValue 'FRONTEND_URL'
$env:STAGING_API_URL = Get-EnvValue 'APP_URL'

try {
    Push-Location $frontendRoot
    try {
        npm.cmd run screenshots:portfolio
        if ($LASTEXITCODE -ne 0) { throw 'Portfolio screenshot capture failed.' }
    } finally { Pop-Location }
} finally {
    Remove-Item Env:STAGING_TEST_PASSWORD -ErrorAction SilentlyContinue
    Remove-Item Env:STAGING_FRONTEND_URL -ErrorAction SilentlyContinue
    Remove-Item Env:STAGING_API_URL -ErrorAction SilentlyContinue
}

Write-Host "Portfolio screenshots generated in $screenshotsRoot" -ForegroundColor Green
