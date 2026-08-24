[CmdletBinding()]
param(
    [switch]$Remove
)

$ErrorActionPreference = 'Stop'
$hostsPath = Join-Path $env:SystemRoot 'System32\drivers\etc\hosts'
$begin = '# BEGIN LOGISTICS SCHOOL LOCAL STAGING'
$end = '# END LOGISTICS SCHOOL LOCAL STAGING'
$managedBlock = @"
$begin
127.0.0.1 logistics.local
127.0.0.1 api.logistics.local
127.0.0.1 mail.logistics.local
$end
"@

$content = [System.IO.File]::ReadAllText($hostsPath)
$pattern = '(?ms)^' + [regex]::Escape($begin) + '.*?^' + [regex]::Escape($end) + '\r?\n?'

if ($Remove) {
    $updated = [regex]::Replace($content, $pattern, '')
    if ($updated -ne $content) {
        [System.IO.File]::WriteAllText($hostsPath, $updated, [System.Text.Encoding]::ASCII)
        Write-Host 'Removed only the managed Logistics School hosts block.' -ForegroundColor Green
    } else {
        Write-Host 'No managed Logistics School hosts block was present.'
    }
    exit 0
}

if ($content -match $pattern) {
    Write-Host 'The managed Logistics School hosts block is already installed.'
    exit 0
}

foreach ($hostName in @('logistics.local', 'api.logistics.local', 'mail.logistics.local')) {
    if ($content -match "(?m)^(?!\s*#).*\s$([regex]::Escape($hostName))(?:\s|$)") {
        throw "$hostName already has an unmanaged hosts entry. Resolve it manually instead of overwriting it."
    }
}

$separator = if ($content.EndsWith("`n")) { '' } else { "`r`n" }
[System.IO.File]::AppendAllText($hostsPath, $separator + $managedBlock + "`r`n", [System.Text.Encoding]::ASCII)
Write-Host 'Installed the managed loopback hosts entries for local staging.' -ForegroundColor Green
