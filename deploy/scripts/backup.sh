#!/usr/bin/env bash
#
# Nightly backup of the LICET CSE ERP (run as root from cron: deploy/cron/erp.cron).
#
#   sudo deploy/scripts/backup.sh            # normal run
#   sudo deploy/scripts/backup.sh --no-offsite
#
# Each run creates BACKUP_DIR/daily/<YYYY-MM-DD_HHMM>/ containing:
#   db.dump         pg_dump custom format of the whole `postgres` database
#                   (public, auth incl. password hashes, storage metadata, ...)
#   globals.sql     roles (pg_dumpall --roles-only), for reference / rebuilds
#   storage.tar.gz  uploaded files (Supabase volumes/storage)
#   config.tar.gz   Supabase .env + override and deploy/.env (all secrets)
#   SHA256SUMS, info.txt
#
# Retention: newest KEEP_DAILY daily sets (default 14); the set taken on
# WEEKLY_DAY (default 7 = Sunday) is also kept under weekly/ for KEEP_WEEKLY
# weeks (default 8). Weekly copies are hard links, so they cost no extra space.
#
# Optional off-site copy: OFFSITE_RSYNC_TARGET and/or OFFSITE_RCLONE_REMOTE.
# Everything here is personal data + secrets: keep BACKUP_DIR mode 700 and use
# an encrypted off-site destination.

set -euo pipefail
. "$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)/lib.sh"

OFFSITE=1
for arg in "$@"; do
  case "$arg" in
    --no-offsite) OFFSITE=0 ;;
    -h|--help) sed -n '2,24p' "$0"; exit 0 ;;
    *) die "Unknown option: $arg" ;;
  esac
done

load_deploy_env
: "${KEEP_DAILY:=14}"
: "${KEEP_WEEKLY:=8}"
: "${WEEKLY_DAY:=7}"
need docker tar gzip sha256sum flock

umask 077
mkdir -p "$BACKUP_DIR/daily" "$BACKUP_DIR/weekly"
chmod 700 "$BACKUP_DIR"

# One backup at a time.
exec 9>"$BACKUP_DIR/.lock"
flock -n 9 || die "Another backup is already running."

require_db_container

stamp="$(date '+%Y-%m-%d_%H%M')"
dest="$BACKUP_DIR/daily/$stamp"
work="$dest.partial"
rm -rf "$work"
mkdir -p "$work"
# Remove a half-written set on any failure (after the final mv it is gone anyway).
trap 'rm -rf "$work"' EXIT

free_kb="$(df -Pk "$BACKUP_DIR" | awk 'NR==2{print $4}')"
if [ "$free_kb" -lt 1048576 ]; then
  warn "Less than 1 GB free in $BACKUP_DIR; the backup may fail."
fi

log "Dumping database from $SUPABASE_DB_CONTAINER"
# supabase_admin is the superuser in self-hosted Supabase; the container has its
# password (POSTGRES_PASSWORD) in PGPASSWORD.
db_exec pg_dump -h localhost -U supabase_admin -d postgres --format=custom --compress=6 > "$work/db.dump"
db_exec pg_restore --list < "$work/db.dump" > "$work/db.toc" \
  || die "The new dump cannot be read back (pg_restore --list failed)."
db_exec pg_dumpall -h localhost -U supabase_admin --roles-only > "$work/globals.sql"

if [ -d "$SUPABASE_DIR/volumes/storage" ]; then
  log "Archiving uploaded files"
  tar -C "$SUPABASE_DIR/volumes" -czf "$work/storage.tar.gz" storage
else
  warn "$SUPABASE_DIR/volumes/storage not found; files were NOT backed up."
fi

log "Archiving configuration and secrets"
cfg=()
for f in "$SUPABASE_DIR/.env" "$SUPABASE_DIR/docker-compose.override.yml" "$SUPABASE_DIR/.supabase-version" "$DEPLOY_DIR/.env"; do
  [ -f "$f" ] && cfg+=("$f")
done
if [ "${#cfg[@]}" -gt 0 ]; then
  tar -czPf "$work/config.tar.gz" "${cfg[@]}"
fi

{
  echo "created=$(date -Iseconds)"
  echo "host=$(hostname)"
  echo "git_commit=$(git -C "$REPO_DIR" rev-parse --short HEAD 2>/dev/null || echo unknown)"
  echo "supabase_ref=$(env_get "$SUPABASE_DIR/.supabase-version" ref)"
  echo "postgres_image=$(docker inspect -f '{{.Config.Image}}' "$SUPABASE_DB_CONTAINER")"
  echo "db_objects=$(grep -vc '^;' "$work/db.toc")"
} > "$work/info.txt"
rm -f "$work/db.toc"

( cd "$work" && sha256sum ./* > SHA256SUMS )
mv "$work" "$dest"
log "Backup written: $dest ($(du -sh "$dest" | cut -f1))"

# ---- weekly copy -----------------------------------------------------------------
if [ "$(date +%u)" = "$WEEKLY_DAY" ]; then
  cp -al "$dest" "$BACKUP_DIR/weekly/$stamp"
  log "Kept as weekly backup: $BACKUP_DIR/weekly/$stamp"
fi

# ---- retention ----------------------------------------------------------------------
prune() {
  local dir="$1" keep="$2" old
  # Directory names sort by date; keep the newest $keep.
  find "$dir" -mindepth 1 -maxdepth 1 -type d ! -name '*.partial' -printf '%f\n' | sort -r | tail -n +"$((keep + 1))" |
    while IFS= read -r old; do
      log "Removing old backup $dir/$old"
      rm -rf -- "${dir:?}/$old"
    done
}
prune "$BACKUP_DIR/daily" "$KEEP_DAILY"
prune "$BACKUP_DIR/weekly" "$KEEP_WEEKLY"

date -Iseconds > "$BACKUP_DIR/last_success"

# ---- off-site ----------------------------------------------------------------------------
if [ "$OFFSITE" = "1" ]; then
  if [ -n "${OFFSITE_RSYNC_TARGET:-}" ]; then
    need rsync
    log "Copying to $OFFSITE_RSYNC_TARGET (rsync)"
    rsync -aH --delete --exclude '.lock' "$BACKUP_DIR/" "$OFFSITE_RSYNC_TARGET/" \
      || { warn "rsync off-site copy failed"; exit 2; }
  fi
  if [ -n "${OFFSITE_RCLONE_REMOTE:-}" ]; then
    need rclone
    log "Copying to $OFFSITE_RCLONE_REMOTE (rclone)"
    rclone sync "$BACKUP_DIR" "$OFFSITE_RCLONE_REMOTE" --exclude '.lock' \
      || { warn "rclone off-site copy failed"; exit 2; }
  fi
fi

log "Backup finished"
