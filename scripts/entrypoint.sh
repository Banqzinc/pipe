#!/bin/sh
# Restore Claude CLI config from backup if missing
if [ ! -f /root/.claude.json ] && ls /root/.claude/backups/.claude.json.backup.* 1>/dev/null 2>&1; then
  BACKUP=$(ls -t /root/.claude/backups/.claude.json.backup.* | head -1)
  cp "$BACKUP" /root/.claude.json
  echo "Restored Claude CLI config from backup: $BACKUP"
fi
exec "$@"
