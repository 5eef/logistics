[CmdletBinding()]
param()

$ErrorActionPreference = 'Stop'
$projectRoot = Split-Path -Parent $PSScriptRoot
$envPath = Join-Path $projectRoot '.env.staging'
$composeFile = Join-Path $projectRoot 'docker-compose.staging.yml'

function Get-EnvValue {
    param([string]$Name)
    $match = Select-String -LiteralPath $envPath -Pattern "^$([regex]::Escape($Name))=(.*)$" | Select-Object -First 1
    if (-not $match) { return $null }
    return $match.Matches[0].Groups[1].Value.Trim().Trim('"').Trim("'")
}

if (-not (Test-Path -LiteralPath $envPath)) { throw '.env.staging is missing.' }
$configuredPath = Get-EnvValue 'BACKUP_PATH'
if ([string]::IsNullOrWhiteSpace($configuredPath) -or [System.IO.Path]::IsPathRooted($configuredPath)) {
    throw 'BACKUP_PATH must be a relative path inside this repository.'
}

$backupRoot = [System.IO.Path]::GetFullPath((Join-Path $projectRoot $configuredPath))
$allowedRoot = [System.IO.Path]::GetFullPath((Join-Path $projectRoot 'backups\mysql'))
if ($backupRoot -ne $allowedRoot) { throw 'BACKUP_PATH must resolve exactly to backups/mysql.' }
[System.IO.Directory]::CreateDirectory($backupRoot) | Out-Null

$retentionDays = 0
if (-not [int]::TryParse((Get-EnvValue 'BACKUP_RETENTION_DAYS'), [ref]$retentionDays) -or $retentionDays -lt 1) {
    throw 'BACKUP_RETENTION_DAYS must be a positive integer.'
}

$stamp = Get-Date -Format 'yyyy-MM-dd_HHmmss'
$baseName = "logistics_$stamp"
if ($baseName -notmatch '^logistics_[0-9]{4}-[0-9]{2}-[0-9]{2}_[0-9]{6}$') { throw 'Unsafe backup filename.' }
$containerSql = "/tmp/$baseName.sql"
$localSql = Join-Path $backupRoot "$baseName.sql"
$localGzip = "$localSql.gz"
$containerId = docker compose --env-file $envPath -f $composeFile ps -q mysql
if ($LASTEXITCODE -ne 0 -or [string]::IsNullOrWhiteSpace($containerId)) { throw 'MySQL staging container is not running.' }

try {
    docker exec $containerId sh -c "umask 077; export MYSQL_PWD=`"`$MYSQL_PASSWORD`"; exec mysqldump --single-transaction --quick --no-tablespaces --routines --events --triggers --set-gtid-purged=OFF --default-character-set=utf8mb4 -u `"`$MYSQL_USER`" `"`$MYSQL_DATABASE`" > '$containerSql'"
    if ($LASTEXITCODE -ne 0) { throw 'mysqldump failed.' }
    docker cp "${containerId}:$containerSql" $localSql
    if ($LASTEXITCODE -ne 0) { throw 'Unable to copy the dump out of the container.' }
    if ((Get-Item -LiteralPath $localSql).Length -lt 256) { throw 'Dump is unexpectedly small.' }

    $input = [System.IO.File]::OpenRead($localSql)
    try {
        $output = [System.IO.File]::Create($localGzip)
        try {
            $gzip = [System.IO.Compression.GZipStream]::new($output, [System.IO.Compression.CompressionLevel]::Optimal)
            try { $input.CopyTo($gzip) } finally { $gzip.Dispose() }
        } finally { $output.Dispose() }
    } finally { $input.Dispose() }

    if ((Get-Item -LiteralPath $localGzip).Length -lt 128) { throw 'Compressed dump is unexpectedly small.' }
} finally {
    docker exec $containerId rm -f $containerSql 2>$null | Out-Null
    if (Test-Path -LiteralPath $localSql) { Remove-Item -LiteralPath $localSql -Force }
}

$cutoff = (Get-Date).AddDays(-$retentionDays)
$removed = 0
Get-ChildItem -LiteralPath $backupRoot -File -Filter 'logistics_*.sql.gz' |
    Where-Object { $_.Name -match '^logistics_[0-9]{4}-[0-9]{2}-[0-9]{2}_[0-9]{6}\.sql\.gz$' -and $_.LastWriteTime -lt $cutoff } |
    ForEach-Object {
        if (-not $_.FullName.StartsWith($backupRoot, [System.StringComparison]::OrdinalIgnoreCase)) { throw 'Retention target escaped backup directory.' }
        Remove-Item -LiteralPath $_.FullName -Force
        $removed++
    }

Write-Host "Backup created: backups/mysql/$([System.IO.Path]::GetFileName($localGzip))" -ForegroundColor Green
Write-Host "Retention removed $removed matching backup(s) older than $retentionDays day(s). Removed files are not recoverable from this script."
