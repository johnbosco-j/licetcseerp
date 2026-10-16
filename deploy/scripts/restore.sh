#!/usr/bin/env bash
#
# Restore the ERP from a backup set made by backup.sh. THIS REPLACES THE LIVE DATA.
#
#   sudo deploy/scripts/restore.sh /var/backups/licet-erp/daily/2026-10-16_0130
#   sudo deploy/scripts/restore.sh <set> --db-only        # database only
#   sudo deploy/scripts/restore.sh <set> --files-only     # uploaded files only
#   options: --no-safety-backup   skip the pre-restore copy of the current state
#            --yes                do not ask (for scripted restore tests)
#
# Steps: verify checksums -> ask you to type RESTORE -> save the current state
# to BACKUP_DIR/pre-restore/<time>/ -> stop the ERP and every Supabase service
# except Postgres -> recreate the `postgres` database from db.dump -> put back
# volumes/storage -> start everything -> run healthcheck.sh.
#
# The backup must come from the same Supabase setup (same JWT secret), or from
# a server whose deploy/.env and Supabase .env were restored from the backup's
# config.tar.gz. Otherwise everyone just signs in again; data is unaffected.
#
# Monthly restore test: run this on a spare VM set up with
# deploy/supabase/setup.sh, never on the live server (deploy/RUNBOOK.md).

set -euo pipefail
. "$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)/lib.sh"

SET_DIR=""
DO_DB=1
DO_FILES=1
SAFETY=1
for arg in "$@"; do
  case "$arg" in
    --db-only) DO_FILES=0 ;;
    --files-only) DO_DB=0 ;;
    --no-safety-backup) SAFETY=0 ;;
    --yes) ASSUME_YES=1 ;;
    -h|--help) sed -n '2,22p' "$0"; exit 0 ;;
    -*) die "Unknown option: $arg" ;;
    *) SET_DIR="$arg" ;;
  esac
done
[ -n "$SET_DIR" ] || die "Usage: restore.sh <backup-set-directory> [--db-only|--files-only] [--yes]"
[ -d "$SET_DIR" ] || die "No such directory: $SET_DIR"
SET_DIR="$(cd "$SET_DIR" && pwd)"

load_deploy_env
need docker tar sha256sum
require_db_container

[ "$DO_DB" = "0" ] || [ -f "$SET_DIR/db.dump" ] || die "$SET_DIR/db.dump is missing."
[ "$DO_FILES" = "0" ] || [ -f "$SET_DIR/storage.tar.gz" ] || die "$SET_DIR/storage.tar.gz is missing (use --db-only?)."

if [ -f "$SET_DIR/SHA256SUMS" ]; then
  log "Verifying checksums"
  ( cd "$SET_DIR" && sha256sum --quiet -c SHA256SUMS ) || die "Checksum mismatch: this backup is damaged."
else
  warn "No SHA256SUMS in $SET_DIR; cannot verify the files."
fi
if [ "$DO_DB" = "1" ]; then
  db_exec pg_restore --list < "$SET_DIR/db.dump" > /dev/null || die "db.dump is not a readable pg_dump archive."
fi

echo
echo "Backup set : $SET_DIR"
[ -f "$SET_DIR/info.txt" ] && sed 's/^/  /' "$SET_DIR/info.txt"
echo "Restore    : $([ "$DO_DB" = 1 ] && echo "database ")$([ "$DO_FILES" = 1 ] && echo "uploaded-files")"
echo "Target     : container $SUPABASE_DB_CONTAINER, $SUPABASE_DIR/volumes/storage on $(hostname)"
echo
confirm "Everything written since this backup will be LOST. The ERP is offline during the restore." RESTORE

stamp="$(date '+%Y-%m-%d_%H%M%S')"

# ---- safety copy of the current state -------------------------------------------
if [ "$SAFETY" = "1" ]; then
  safe="$BACKUP_DIR/pre-restore/$stamp"
  umask 077
  mkdir -p "$safe"
  log "Saving the current state to $safe"
  if [ "$DO_DB" = "1" ]; then
    db_exec pg_dump -h localhost -U supabase_admin -d postgres --format=custom > "$safe/db.dump"
  fi
  if [ "$DO_FILES" = "1" ] && [ -d "$SUPABASE_DIR/volumes/storage" ]; then
    tar -C "$SUPABASE_DIR/volumes" -czf "$safe/storage.tar.gz" storage
  fi
  ( cd "$safe" && sha256sum ./* > SHA256SUMS )
fi

# ---- stop everything that talks to the database -------------------------------
log "Stopping the ERP and the Supabase services (Postgres keeps running)"
app_compose stop app 2>/dev/null || warn "Could not stop the ERP app container (not running?)"
mapfile -t services < <(supabase_compose config --services | grep -vx db)
supabase_compose stop "${services[@]}"

# ---- database ----------------------------------------------------------------------
if [ "$DO_DB" = "1" ]; then
  log "Recreating the postgres database from db.dump"
  db_exec psql -h localhost -U supabase_admin -d template1 -v ON_ERROR_STOP=1 \
    -c 'DROP DATABASE IF EXISTS postgres WITH (FORCE);'
  errlog="$BACKUP_DIR/pre-restore/restore-$stamp.log"
  mkdir -p "$(dirname "$errlog")"
  set +e
  db_exec pg_restore -h localhost -U supabase_admin -d template1 --create < "$SET_DIR/db.dump" 2> "$errlog"
  rc=$?
  set -e
  db_exec psql -h localhost -U supabase_admin -d template1 -tAc "SELECT 1 FROM pg_database WHERE datname = 'postgres'" | grep -q 1 \
    || die "The postgres database was not recreated. See $errlog. Safety copy: ${safe:-none}"
  nerr="$(grep -c 'ERROR' "$errlog" || true)"
  if [ "$rc" != "0" ] || [ "$nerr" != "0" ]; then
    warn "pg_restore reported $nerr error(s) (exit $rc). Supabase dumps often have a few harmless ones"
    warn "(extensions or event triggers that already exist). Review: $errlog"
    grep 'ERROR' "$errlog" | head -n 15 >&2 || true
  else
    log "Database restored without errors"
  fi
fi

# ---- uploaded files ---------------------------------------------------------------------
if [ "$DO_FILES" = "1" ]; then
  if [ -d "$SUPABASE_DIR/volumes/storage" ]; then
    mv "$SUPABASE_DIR/volumes/storage" "$SUPABASE_DIR/volumes/storage.before-restore-$stamp"
    log "Old files moved to volumes/storage.before-restore-$stamp (delete it once all is well)"
  fi
  tar -C "$SUPABASE_DIR/volumes" -xzf "$SET_DIR/storage.tar.gz"
  log "Uploaded files restored"
fi

# ---- start again -----------------------------------------------------------------------------
log "Starting Supabase and the ERP"
supabase_compose up -d
for _ in $(seq 1 60); do
  state="$(docker inspect -f '{{if .State.Health}}{{.State.Health.Status}}{{else}}{{.State.Status}}{{end}}' supabase-storage 2>/dev/null || true)"
  [ "$state" = "healthy" ] && break
  sleep 5
done
app_compose up -d app 2>/dev/null || warn "Start the ERP yourself: docker compose -f $APP_COMPOSE up -d"

if [ "$DO_DB" = "1" ]; then
  log "Row counts after restore:"
  db_psql -c "SELECT (SELECT count(*) FROM auth.users) AS auth_users,
                     (SELECT count(*) FROM public.profiles) AS profiles,
                     (SELECT count(*) FROM public.attendance_sessions) AS attendance_sessions,
                     (SELECT count(*) FROM public.marks) AS marks,
                     (SELECT count(*) FROM storage.objects) AS storage_objects;" || true
fi

"$DEPLOY_DIR/scripts/healthcheck.sh" || warn "Health check reported problems; see above."
log "Restore finished. Safety copy of the previous state: ${safe:-not taken}"
