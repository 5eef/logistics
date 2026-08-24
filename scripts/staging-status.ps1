[CmdletBinding()]
param()

$ErrorActionPreference = 'Stop'
$projectRoot = Split-Path -Parent $PSScriptRoot
$envPath = Join-Path $projectRoot '.env.staging'
$composeFile = Join-Path $projectRoot 'docker-compose.staging.yml'
$backupRoot = Join-Path $projectRoot 'backups\mysql'

if (-not (Test-Path -LiteralPath $envPath)) { throw '.env.staging is missing.' }

Write-Host 'Containers (no secret values):' -ForegroundColor Cyan
docker compose --env-file $envPath -f $composeFile ps
if ($LASTEXITCODE -ne 0) { throw 'Unable to inspect staging.' }

function Test-Url {
    param([string]$HostName, [string]$Path)
    curl.exe --silent --show-error --fail --insecure --resolve "${HostName}:443:127.0.0.1" "https://${HostName}${Path}" | Out-Null
    return $LASTEXITCODE -eq 0
}

Write-Host ("Backend health: {0}" -f $(if (Test-Url 'api.logistics.local' '/api/health') { 'UP' } else { 'DOWN' }))
Write-Host ("Frontend health: {0}" -f $(if (Test-Url 'logistics.local' '/') { 'UP' } else { 'DOWN' }))

$mysqlOk = docker compose --env-file $envPath -f $composeFile exec -T mysql sh -c 'mysqladmin ping --silent --host=127.0.0.1 --user="$MYSQL_USER" --password="$MYSQL_PASSWORD"' 2>$null
Write-Host ("MySQL health: {0}" -f $(if ($LASTEXITCODE -eq 0) { 'UP' } else { 'DOWN' }))

$reverbOk = docker compose --env-file $envPath -f $composeFile exec -T reverb php -r '$s=@fsockopen("127.0.0.1",8080,$e,$m,2);exit($s?0:1);' 2>$null
Write-Host ("Reverb health: {0}" -f $(if ($LASTEXITCODE -eq 0) { 'UP' } else { 'DOWN' }))

$failedJobs = docker compose --env-file $envPath -f $composeFile exec -T backend php artisan queue:failed --no-ansi 2>$null
if ($LASTEXITCODE -eq 0) { Write-Host 'Failed jobs: query OK (inspect with scripts/staging-logs.ps1 if needed)' }

$latest = Get-ChildItem -LiteralPath $backupRoot -File -Filter 'logistics_*.sql.gz' -ErrorAction SilentlyContinue |
    Sort-Object LastWriteTimeUtc -Descending | Select-Object -First 1
Write-Host ("Latest backup: {0}" -f $(if ($latest) { $latest.LastWriteTime.ToString('u') } else { 'NONE' }))

$driveName = [System.IO.Path]::GetPathRoot($projectRoot).Substring(0, 1)
$drive = Get-PSDrive -Name $driveName
Write-Host ("Disk free: {0:N1} GiB" -f ($drive.Free / 1GB))
