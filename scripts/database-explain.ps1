[CmdletBinding()]
param()

$ErrorActionPreference = 'Stop'
$projectRoot = Split-Path -Parent $PSScriptRoot
$envPath = Join-Path $projectRoot '.env.staging'
$composeFile = Join-Path $projectRoot 'docker-compose.staging.yml'

if (-not (Test-Path -LiteralPath $envPath)) { throw '.env.staging is missing.' }

$sql = @'
EXPLAIN SELECT id FROM colis WHERE status='pending' AND from_city='Casablanca' ORDER BY created_at DESC LIMIT 20;
EXPLAIN SELECT id FROM colis WHERE expediteur_id=1 ORDER BY created_at DESC LIMIT 20;
EXPLAIN SELECT id FROM colis WHERE livreur_id=1 ORDER BY created_at DESC LIMIT 20;
EXPLAIN SELECT id FROM colis WHERE destinataire_id=1 ORDER BY created_at DESC LIMIT 20;
EXPLAIN SELECT id FROM colis WHERE tracking_id='LOG000000000000';
EXPLAIN SELECT id FROM notifications WHERE user_id=1 AND is_read=0 ORDER BY created_at DESC LIMIT 10;
EXPLAIN SELECT id FROM users WHERE role='livreur' AND verification_status='pending' LIMIT 20;
EXPLAIN SELECT COUNT(*), SUM(CASE WHEN payment_status='paid' THEN price ELSE 0 END) FROM colis WHERE expediteur_id=1;
'@

Write-Host 'MySQL EXPLAIN for staging read paths (no data or secrets are printed):' -ForegroundColor Cyan
$sql | docker compose --env-file $envPath -f $composeFile exec -T mysql sh -c 'MYSQL_PWD="$MYSQL_PASSWORD" mysql --batch --table --user="$MYSQL_USER" "$MYSQL_DATABASE"'
if ($LASTEXITCODE -ne 0) { throw 'MySQL EXPLAIN failed.' }
