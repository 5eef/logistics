[CmdletBinding()]
param()

$ErrorActionPreference = 'Stop'
$projectRoot = Split-Path -Parent $PSScriptRoot
$envPath = Join-Path $projectRoot '.env.staging'
$composeFile = Join-Path $projectRoot 'docker-compose.staging.yml'

if (-not (Test-Path -LiteralPath $envPath)) { throw '.env.staging is missing.' }

docker compose --env-file $envPath -f $composeFile down --remove-orphans
if ($LASTEXITCODE -ne 0) { throw 'Unable to stop staging.' }
Write-Host 'Staging stopped. Persistent MySQL, Mailpit and Caddy volumes were preserved.' -ForegroundColor Green
