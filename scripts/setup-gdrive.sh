#!/usr/bin/env bash
# One-time setup: configure rclone for Google Drive backup
# Run this script on the SERVER: bash ~/warehouse-stocks/scripts/setup-gdrive.sh
set -euo pipefail

echo "=== Google Drive Backup Setup ==="
echo ""

# Install rclone if not present
if ! command -v rclone &>/dev/null; then
  echo "[1/3] Installing rclone..."
  curl -fsSL https://rclone.org/install.sh | sudo bash
else
  echo "[1/3] rclone already installed: $(rclone version | head -1)"
fi

# Configure Google Drive remote
if rclone listremotes | grep -q "^gdrive:"; then
  echo "[2/3] Google Drive remote 'gdrive' already configured."
else
  echo ""
  echo "[2/3] Configuring Google Drive remote..."
  echo "      rclone will print a URL — open it in your browser, sign in"
  echo "      with your Google account, and paste the auth code back here."
  echo ""
  rclone config create gdrive drive scope=drive.file
fi

# Create backup folder on Drive
echo "[3/3] Creating 'WarehouseBackups' folder on Google Drive..."
rclone mkdir "gdrive:WarehouseBackups" 2>/dev/null || true

echo ""
echo "=== Setup complete! ==="
echo ""
echo "Test with:"
echo "  bash ~/warehouse-stocks/scripts/backup-db.sh"
echo ""
echo "Enable daily 2am auto-backup (add to crontab):"
echo "  crontab -e"
echo "  # Add this line:"
echo "  0 2 * * * /home/dckakadia/warehouse-stocks/scripts/backup-db.sh >> /home/dckakadia/warehouse-stocks/backups/backup.log 2>&1"
