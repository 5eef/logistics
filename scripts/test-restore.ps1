[CmdletBinding()]
param(
    [string]$BackupFile
)

$ErrorActionPreference = 'Stop'
$projectRoot = Split-Path -Parent $PSScriptRoot
$envPath = Join-Path $projectRoot '.env.staging'
$composeFile = Join-Path $projectRoot 'docker-compose.staging.yml'
$backupRoot = [System.IO.Path]::GetFullPath((Join-Path $projectRoot 'backups\mysql'))

if (-not (Test-Path -LiteralPath $envPath)) { throw '.env.staging is missing.' }
if ([string]::IsNullOrWhiteSpace($BackupFile)) {
    $selected = Get-ChildItem -LiteralPath $backupRoot -File -Filter 'logistics_*.sql.gz' |
        Where-Object { $_.Name -match '^logistics_[0-9]{4}-[0-9]{2}-[0-9]{2}_[0-9]{6}\.sql\.gz$' } |
        Sort-Object LastWriteTimeUtc -Descending | Select-Object -First 1
} else {
    $selected = Get-Item -LiteralPath $BackupFile
}
if (-not $selected) { throw 'No matching MySQL backup found.' }
if (-not $selected.FullName.StartsWith($backupRoot, [System.StringComparison]::OrdinalIgnoreCase)) {
    throw 'Restore tests accept backups only from backups/mysql.'
}

$databaseName = 'logistics_restore_' + (Get-Date -Format 'yyyyMMddHHmmss') + '_' + ([guid]::NewGuid().ToString('N').Substring(0, 8))
if ($databaseName -notmatch '^logistics_restore_[a-zA-Z0-9_]+$') { throw 'Unsafe temporary database name.' }
$temporarySql = Join-Path ([System.IO.Path]::GetTempPath()) "$databaseName.sql"
$containerSql = "/tmp/$databaseName.sql"
$containerId = docker compose --env-file $envPath -f $composeFile ps -q mysql
if ($LASTEXITCODE -ne 0 -or [string]::IsNullOrWhiteSpace($containerId)) { throw 'MySQL staging container is not running.' }
$created = $false

try {
    $input = [System.IO.File]::OpenRead($selected.FullName)
    try {
        $gzip = [System.IO.Compression.GZipStream]::new($input, [System.IO.Compression.CompressionMode]::Decompress)
        try {
            $output = [System.IO.File]::Create($temporarySql)
            try { $gzip.CopyTo($output) } finally { $output.Dispose() }
        } finally { $gzip.Dispose() }
    } finally { $input.Dispose() }

    docker cp $temporarySql "${containerId}:$containerSql"
    if ($LASTEXITCODE -ne 0) { throw 'Unable to copy dump into MySQL container.' }
    $createQuery = "CREATE DATABASE ``$databaseName`` CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;"
    $createQuery | docker exec -i $containerId sh -c 'export MYSQL_PWD="$MYSQL_ROOT_PASSWORD"; exec mysql -u root'
    if ($LASTEXITCODE -ne 0) { throw 'Unable to create isolated restore database.' }
    $created = $true
    docker exec $containerId sh -c "export MYSQL_PWD=`"`$MYSQL_ROOT_PASSWORD`"; mysql -u root '$databaseName' < '$containerSql'"
    if ($LASTEXITCODE -ne 0) { throw 'Restore import failed.' }

    $criticalQuery = "SELECT COUNT(*) FROM information_schema.tables WHERE table_schema='$databaseName' AND table_name IN ('migrations','users','colis','jobs','failed_jobs','sessions');"
    $criticalCount = $criticalQuery | docker exec -i $containerId sh -c 'export MYSQL_PWD="$MYSQL_ROOT_PASSWORD"; exec mysql -N -u root'
    if ($LASTEXITCODE -ne 0 -or [int]$criticalCount -ne 6) { throw 'Critical table verification failed.' }
    $migrationQuery = "SELECT COUNT(*) FROM ``$databaseName``.migrations;"
    $migrationCount = $migrationQuery | docker exec -i $containerId sh -c 'export MYSQL_PWD="$MYSQL_ROOT_PASSWORD"; exec mysql -N -u root'
    if ($LASTEXITCODE -ne 0 -or [int]$migrationCount -lt 1) { throw 'Migration ledger verification failed.' }
    $orphanQuery = "SELECT COUNT(*) FROM ``$databaseName``.colis c LEFT JOIN ``$databaseName``.users u ON u.id=c.expediteur_id WHERE u.id IS NULL;"
    $orphanCount = $orphanQuery | docker exec -i $containerId sh -c 'export MYSQL_PWD="$MYSQL_ROOT_PASSWORD"; exec mysql -N -u root'
    if ($LASTEXITCODE -ne 0 -or [int]$orphanCount -ne 0) { throw 'Shipment sender consistency check failed.' }

    Write-Host "Restore test passed for $($selected.Name): critical tables, migrations and shipment ownership are coherent." -ForegroundColor Green
} finally {
    if ($created -and $databaseName -match '^logistics_restore_[a-zA-Z0-9_]+$') {
        $dropQuery = "DROP DATABASE ``$databaseName``;"
        $dropQuery | docker exec -i $containerId sh -c 'export MYSQL_PWD="$MYSQL_ROOT_PASSWORD"; exec mysql -u root' 2>$null | Out-Null
    }
    docker exec $containerId rm -f $containerSql 2>$null | Out-Null
    if (Test-Path -LiteralPath $temporarySql) { Remove-Item -LiteralPath $temporarySql -Force }
}
