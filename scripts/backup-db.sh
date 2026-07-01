#!/usr/bin/env bash
# Daily backup: SQLite dump → gzip locally → sync to Google Drive (if rclone configured)
# Cron: 0 2 * * * /home/dckakadia/warehouse-stocks/scripts/backup-db.sh >> /home/dckakadia/warehouse-stocks/backups/backup.log 2>&1
set -euo pipefail

APP_DIR="$(cd "$(dirname "$0")/.." && pwd)"
DB_FILE="$APP_DIR/warehouse.db"
BACKUP_DIR="$APP_DIR/backups"
MAX_DAYS=14

if [[ ! -f "$DB_FILE" ]]; then
  echo "[backup] ERROR: Database not found: $DB_FILE" >&2
  exit 1
fi

mkdir -p "$BACKUP_DIR"

TIMESTAMP=$(date +%Y%m%d_%H%M%S)
BACKUP_FILE="$BACKUP_DIR/warehouse_${TIMESTAMP}.db.gz"

# Safe backup while server is running — sqlite3 .dump is consistent
sqlite3 "$DB_FILE" ".dump" | gzip -9 > "$BACKUP_FILE"
SIZE=$(du -sh "$BACKUP_FILE" | cut -f1)
echo "[backup] $(date '+%Y-%m-%d %H:%M:%S') Created: warehouse_${TIMESTAMP}.db.gz ($SIZE)"

# Rotate local backups older than MAX_DAYS
find "$BACKUP_DIR" -name "warehouse_*.db.gz" -mtime "+${MAX_DAYS}" -delete
echo "[backup] Local rotation: kept last ${MAX_DAYS} days"

# Google Drive sync (only if rclone is installed and gdrive remote is configured)
if command -v rclone &>/dev/null && rclone listremotes 2>/dev/null | grep -q "^gdrive:"; then
  rclone copy "$BACKUP_FILE" "gdrive:WarehouseBackups/" --log-level INFO 2>&1 | sed 's/^/[gdrive] /'
  # Also delete Drive copies older than MAX_DAYS
  rclone delete "gdrive:WarehouseBackups/" \
    --min-age "${MAX_DAYS}d" \
    --log-level INFO 2>&1 | sed 's/^/[gdrive] /' || true
  echo "[backup] Google Drive sync complete"
else
  echo "[backup] rclone/gdrive not configured — skipping Google Drive upload"
  echo "[backup] Run: bash $APP_DIR/scripts/setup-gdrive.sh  to enable Drive backups"
fi
