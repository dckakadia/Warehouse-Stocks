#!/usr/bin/env bash
# Daily SQLite backup — keeps 14 days of history
# Usage: bash scripts/backup-db.sh
# Intended to run via cron: 0 2 * * * /home/dckakadia/warehouse-stocks/scripts/backup-db.sh

set -euo pipefail

APP_DIR="$(cd "$(dirname "$0")/.." && pwd)"
DB_FILE="$APP_DIR/warehouse.db"
BACKUP_DIR="$APP_DIR/backups"
MAX_DAYS=14

if [[ ! -f "$DB_FILE" ]]; then
  echo "[backup] Database not found: $DB_FILE" >&2
  exit 1
fi

mkdir -p "$BACKUP_DIR"

TIMESTAMP=$(date +%Y%m%d_%H%M%S)
BACKUP_FILE="$BACKUP_DIR/warehouse_${TIMESTAMP}.db.gz"

# Use SQLite .dump for a safe consistent backup even while server is running
sqlite3 "$DB_FILE" ".dump" | gzip -9 > "$BACKUP_FILE"

echo "[backup] Created: $BACKUP_FILE ($(du -sh "$BACKUP_FILE" | cut -f1))"

# Rotate: remove backups older than MAX_DAYS
find "$BACKUP_DIR" -name "warehouse_*.db.gz" -mtime "+${MAX_DAYS}" -delete
echo "[backup] Kept last ${MAX_DAYS} days of backups in $BACKUP_DIR"
