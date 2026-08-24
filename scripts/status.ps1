[CmdletBinding()]
param()

& (Join-Path $PSScriptRoot 'staging-status.ps1')
exit $LASTEXITCODE
