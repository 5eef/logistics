[CmdletBinding()]
param(
    [switch]$Force,
    [switch]$RotateAppKeyOnly
)

$ErrorActionPreference = 'Stop'
$projectRoot = Split-Path -Parent $PSScriptRoot
$templatePath = Join-Path $projectRoot '.env.staging.example'
$targetPath = Join-Path $projectRoot '.env.staging'

if (-not (Test-Path -LiteralPath $templatePath)) {
    throw 'Missing .env.staging.example.'
}
if ($Force -and $RotateAppKeyOnly) {
    throw '-Force and -RotateAppKeyOnly are mutually exclusive.'
}
if ((Test-Path -LiteralPath $targetPath) -and -not $Force -and -not $RotateAppKeyOnly) {
    throw '.env.staging already exists. Use -Force only if rotating all local staging secrets is intentional.'
}

function New-RandomBase64Url {
    param([int]$Bytes = 32)
    $buffer = [byte[]]::new($Bytes)
    $generator = [System.Security.Cryptography.RandomNumberGenerator]::Create()
    try { $generator.GetBytes($buffer) } finally { $generator.Dispose() }
    return [Convert]::ToBase64String($buffer).TrimEnd('=').Replace('+', '-').Replace('/', '_')
}

function New-LaravelAppKey {
    $buffer = [byte[]]::new(32)
    $generator = [System.Security.Cryptography.RandomNumberGenerator]::Create()
    try { $generator.GetBytes($buffer) } finally { $generator.Dispose() }
    return 'base64:' + [Convert]::ToBase64String($buffer)
}

if ($RotateAppKeyOnly) {
    if (-not (Test-Path -LiteralPath $targetPath)) { throw '.env.staging does not exist.' }
    $existingLines = [System.IO.File]::ReadAllLines($targetPath)
    for ($index = 0; $index -lt $existingLines.Length; $index++) {
        if ($existingLines[$index] -match '^APP_KEY=') { $existingLines[$index] = 'APP_KEY=' + (New-LaravelAppKey) }
    }
    [System.IO.File]::WriteAllLines($targetPath, $existingLines, [System.Text.UTF8Encoding]::new($false))
    Write-Host 'Rotated only the ignored local APP_KEY using Laravel-compatible base64. No secret was printed.' -ForegroundColor Green
    exit 0
}

$values = @{
    APP_KEY = New-LaravelAppKey
    MYSQL_ROOT_PASSWORD = New-RandomBase64Url 36
    DB_PASSWORD = New-RandomBase64Url 36
    REVERB_APP_ID = ([guid]::NewGuid().ToString('N'))
    REVERB_APP_KEY = New-RandomBase64Url 24
    REVERB_APP_SECRET = New-RandomBase64Url 36
    STAGING_TEST_PASSWORD = 'Stg!' + (New-RandomBase64Url 24)
    STAGING_TEST_NEW_PASSWORD = 'StgNew!' + (New-RandomBase64Url 24)
}

$lines = [System.IO.File]::ReadAllLines($templatePath)
for ($index = 0; $index -lt $lines.Length; $index++) {
    if ($lines[$index] -match '^([A-Z][A-Z0-9_]*)=') {
        $name = $Matches[1]
        if ($values.ContainsKey($name)) {
            $lines[$index] = "$name=$($values[$name])"
        }
    }
}

[System.IO.File]::WriteAllLines($targetPath, $lines, [System.Text.UTF8Encoding]::new($false))
Write-Host 'Created ignored .env.staging with cryptographically random local values. No secret was printed.' -ForegroundColor Green
