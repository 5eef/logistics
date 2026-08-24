#!/bin/sh
set -eu

SCRIPT_DIR=$(CDPATH= cd -- "$(dirname -- "$0")" && pwd)
PROJECT_ROOT=$(dirname "$SCRIPT_DIR")
ENV_FILE="$PROJECT_ROOT/.env.staging"
COMPOSE_FILE="$PROJECT_ROOT/docker-compose.staging.yml"
BACKUP_ROOT="$PROJECT_ROOT/backups/mysql"

if [ ! -f "$ENV_FILE" ]; then
    echo '.env.staging is missing.' >&2
    exit 1
fi

RETENTION_DAYS=$(sed -n 's/^BACKUP_RETENTION_DAYS=//p' "$ENV_FILE" | tail -n 1)
case "$RETENTION_DAYS" in ''|*[!0-9]*) echo 'Invalid BACKUP_RETENTION_DAYS.' >&2; exit 1;; esac
[ "$RETENTION_DAYS" -ge 1 ] || { echo 'BACKUP_RETENTION_DAYS must be positive.' >&2; exit 1; }

mkdir -p "$BACKUP_ROOT"
STAMP=$(date '+%Y-%m-%d_%H%M%S')
BASE="logistics_$STAMP"
CONTAINER_SQL="/tmp/$BASE.sql"
LOCAL_SQL="$BACKUP_ROOT/$BASE.sql"
LOCAL_GZIP="$LOCAL_SQL.gz"
CONTAINER_ID=$(docker compose --env-file "$ENV_FILE" -f "$COMPOSE_FILE" ps -q mysql)
[ -n "$CONTAINER_ID" ] || { echo 'MySQL staging container is not running.' >&2; exit 1; }

cleanup() {
    docker exec "$CONTAINER_ID" rm -f "$CONTAINER_SQL" >/dev/null 2>&1 || true
    rm -f "$LOCAL_SQL"
}
trap cleanup EXIT INT TERM

docker exec "$CONTAINER_ID" sh -c "umask 077; export MYSQL_PWD=\"\$MYSQL_PASSWORD\"; exec mysqldump --single-transaction --quick --no-tablespaces --routines --events --triggers --set-gtid-purged=OFF --default-character-set=utf8mb4 -u \"\$MYSQL_USER\" \"\$MYSQL_DATABASE\" > '$CONTAINER_SQL'"
docker cp "$CONTAINER_ID:$CONTAINER_SQL" "$LOCAL_SQL"
[ "$(wc -c < "$LOCAL_SQL")" -ge 256 ] || { echo 'Dump is unexpectedly small.' >&2; exit 1; }
gzip -9 "$LOCAL_SQL"

find "$BACKUP_ROOT" -maxdepth 1 -type f -name 'logistics_????-??-??_??????.sql.gz' -mtime "+$RETENTION_DAYS" -delete
echo "Backup created: backups/mysql/$BASE.sql.gz"
