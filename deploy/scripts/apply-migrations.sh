#!/usr/bin/env bash
#
# Apply supabase/migrations/*.sql, in order, to the self-hosted database.
# For a CLEAN INSTALL (no data from the cloud), and later for new migrations.
#
#   sudo deploy/scripts/apply-migrations.sh             # apply everything pending
#   sudo deploy/scripts/apply-migrations.sh --dry-run   # list what would run
#   sudo deploy/scripts/apply-migrations.sh --baseline  # record all files as applied
#                                                       # without running them (after
#                                                       # migrate-from-cloud.sh)
#
# Each file runs in its own transaction as the `postgres` role (like
# `supabase db push`) and is recorded in supabase_migrations.schema_migrations,
# the table the Supabase CLI uses, so a file never runs twice. A failing file
# is rolled back and the script stops there.
#
# Self-hosted Supabase must be running: migration 10 creates storage buckets,
# which needs the storage service to have created the storage schema.

set -euo pipefail
. "$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)/lib.sh"

DRY_RUN=0
BASELINE=0
for arg in "$@"; do
  case "$arg" in
    --dry-run) DRY_RUN=1 ;;
    --baseline) BASELINE=1 ;;
    -h|--help) sed -n '2,18p' "$0"; exit 0 ;;
    *) die "Unknown option: $arg" ;;
  esac
done

load_deploy_env
require_db_container
MIG_DIR="${MIGRATIONS_DIR:-$REPO_DIR/supabase/migrations}"
[ -d "$MIG_DIR" ] || die "No migrations directory at $MIG_DIR"

for _ in $(seq 1 24); do
  [ "$(db_psql -tAc "SELECT to_regclass('storage.buckets') IS NOT NULL")" = "t" ] && break
  log "Waiting for the storage service to create the storage schema..."
  sleep 5
done
[ "$(db_psql -tAc "SELECT to_regclass('storage.buckets') IS NOT NULL")" = "t" ] \
  || die "storage.buckets does not exist. Is the Supabase storage container running? (cd $SUPABASE_DIR && docker compose ps)"

db_psql -q <<'SQL'
CREATE SCHEMA IF NOT EXISTS supabase_migrations;
CREATE TABLE IF NOT EXISTS supabase_migrations.schema_migrations (
  version text PRIMARY KEY,
  statements text[],
  name text
);
SQL

applied="$(db_psql -tAc "SELECT version FROM supabase_migrations.schema_migrations")"

mapfile -t files < <(find "$MIG_DIR" -maxdepth 1 -type f -name '*.sql' | sort)
[ "${#files[@]}" -gt 0 ] || die "No .sql files in $MIG_DIR"

pending=()
for f in "${files[@]}"; do
  base="$(basename "$f" .sql)"
  version="${base%%_*}"
  [[ "$version" =~ ^[0-9]+$ ]] || die "Cannot read a version number from $(basename "$f")"
  grep -qx "$version" <<< "$applied" || pending+=("$f")
done

if [ "${#pending[@]}" -eq 0 ]; then
  log "Database is up to date (${#files[@]} migrations already applied)."
  exit 0
fi

if [ "$(db_psql -tAc "SELECT count(*) FROM supabase_migrations.schema_migrations")" = "0" ] \
   && [ "$(db_psql -tAc "SELECT to_regclass('public.profiles') IS NOT NULL")" = "t" ] \
   && [ "$BASELINE" = "0" ] && [ "$DRY_RUN" = "0" ]; then
  die "The database already has ERP tables but no migration history (data came from the cloud?). Run with --baseline to record the existing migrations instead of re-running them."
fi

log "${#pending[@]} pending migration(s):"
for f in "${pending[@]}"; do echo "  $(basename "$f")"; done
[ "$DRY_RUN" = "1" ] && exit 0

for f in "${pending[@]}"; do
  base="$(basename "$f" .sql)"
  version="${base%%_*}"
  name="${base#*_}"
  if [ "$BASELINE" = "1" ]; then
    db_psql -q -c "INSERT INTO supabase_migrations.schema_migrations (version, name) VALUES ('$version', '$name') ON CONFLICT DO NOTHING"
    log "Recorded (not run): $base"
    continue
  fi
  log "Applying $base"
  {
    cat "$f"
    printf '\n;\nINSERT INTO supabase_migrations.schema_migrations (version, name) VALUES (%s, %s);\n' \
      "'$version'" "'$name'"
  } | db_psql -q --single-transaction -f - \
    || die "Migration $base failed and was rolled back. Fix it, then run this script again."
done
log "Done. Applied ${#pending[@]} migration(s)."
