[CmdletBinding()]
param(
    [ValidateSet('all', 'backend', 'frontend', 'mysql', 'reverb', 'queue', 'scheduler', 'mailpit', 'reverse-proxy')]
    [string]$Service = 'all',
    [int]$Tail = 200,
    [switch]$Follow
)

$ErrorActionPreference = 'Stop'
$projectRoot = Split-Path -Parent $PSScriptRoot
$envPath = Join-Path $projectRoot '.env.staging'
$composeFile = Join-Path $projectRoot 'docker-compose.staging.yml'
$arguments = @('compose', '--env-file', $envPath, '-f', $composeFile, 'logs', '--tail', $Tail)
if ($Follow) { $arguments += '--follow' }
if ($Service -ne 'all') { $arguments += $Service }

& docker @arguments
if ($LASTEXITCODE -ne 0) { throw 'Unable to read staging logs.' }
