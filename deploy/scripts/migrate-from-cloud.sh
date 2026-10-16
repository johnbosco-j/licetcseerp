#!/usr/bin/env bash
#
# Copy the ERP database from Supabase cloud into the self-hosted Supabase on
# this server (the official dump/restore procedure), then compare row counts.
#
#   export OLD_DB_URL='postgresql://postgres.<ref>:<password>@aws-0-<region>.pooler.supabase.com:5432/postgres'
#   sudo -E deploy/scripts/migrate-from-cloud.sh                # dump + restore + verify
#   sudo -E deploy/scripts/migrate-from-cloud.sh --dump-only    # just make the dump files
#   sudo -E deploy/scripts/migrate-from-cloud.sh --restore-only DIR   # restore earlier dumps
#   sudo -E deploy/scripts/migrate-from-cloud.sh --verify-only  # only compare row counts
#
# Options:
#   --fix-owners  comment out `ALTER ... OWNER TO "supabase_admin"` lines in
#                 schema.sql (use it if the restore fails on them)
#   --force       restore even though the target already has ERP tables
#   --yes         do not ask for confirmation
#
# OLD_DB_URL: Supabase dashboard -> Connect -> "Session pooler" URI (IPv4; the
# direct db.<ref>.supabase.co address is IPv6-only). Use the database password.
#
# Needs: Docker, a running self-hosted Supabase (deploy/supabase/setup.sh), and
# the Supabase CLI (`supabase` on PATH, or set SUPABASE_CLI; by default it falls
# back to `npx --yes supabase`). Uploaded files are copied separately with
# deploy/scripts/copy-storage.mjs.
#
# The dump files contain every user's password hash and all personal data. They
# are written mode 600 under MIGRATION_DIR; delete them after the cutover.

set -euo pipefail
. "$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)/lib.sh"

MODE=all
RESTORE_FROM=""
FIX_OWNERS=0
FORCE=0
while [ $# -gt 0 ]; do
  case "$1" in
    --dump-only) MODE=dump ;;
    --restore-only) MODE=restore; RESTORE_FROM="${2:?--restore-only needs a directory}"; shift ;;
    --verify-only) MODE=verify ;;
    --fix-owners) FIX_OWNERS=1 ;;
    --force) FORCE=1 ;;
    --yes) ASSUME_YES=1 ;;
    -h|--help) sed -n '2,29p' "$0"; exit 0 ;;
    *) die "Unknown option: $1 (see --help)" ;;
  esac
  shift
done

load_deploy_env
need docker sed grep
: "${DB_USER:=postgres}"   # role the restore runs as (official docs: postgres)

if [ -z "${SUPABASE_CLI:-}" ]; then
  if command -v supabase >/dev/null 2>&1; then SUPABASE_CLI="supabase"; else SUPABASE_CLI="npx --yes supabase"; fi
fi

# Tables compared after the restore (schema.table).
VERIFY_TABLES=(
  auth.users
  public.profiles
  public.subjects
  public.attendance_sessions
  public.attendance
  public.timetable_entries
  public.calendar_days
  public.marks
  public.audit_log
  storage.buckets
  storage.objects
)

need_old_url() {
  [ -n "${OLD_DB_URL:-}" ] || die "Set OLD_DB_URL to the Supabase cloud session-pooler connection string."
  case "$OLD_DB_URL" in postgres://*|postgresql://*) ;; *) die "OLD_DB_URL must start with postgresql://" ;; esac
}

# psql against the cloud database, run inside the Postgres container (so the
# host needs no psql) with the URL passed via the environment, not the command line.
old_psql() {
  docker exec -i -e OLD_DB_URL "$SUPABASE_DB_CONTAINER" sh -c 'psql "$OLD_DB_URL" -v ON_ERROR_STOP=1 "$@"' psql "$@"
}

count_rows() {  # count_rows old|new
  local side="$1" t sql=""
  for t in "${VERIFY_TABLES[@]}"; do
    sql+="SELECT '$t' AS t, CASE WHEN to_regclass('$t') IS NULL THEN -1 ELSE (xpath('/row/c/text()', query_to_xml('SELECT count(*) AS c FROM $t', false, true, '')))[1]::text::bigint END AS n UNION ALL "
  done
  sql+="SELECT 'auth.users (with password)', (SELECT count(*) FROM auth.users WHERE encrypted_password IS NOT NULL AND encrypted_password <> '')"
  if [ "$side" = old ]; then old_psql -tA -F '|' -c "$sql"; else db_psql -tA -F '|' -c "$sql"; fi
}

verify() {
  need_old_url
  require_db_container
  log "Counting rows in the cloud and on this server"
  local old new mismatch=0 t o n
  old="$(count_rows old)" || die "Could not query the cloud database."
  new="$(count_rows new)" || die "Could not query the local database."
  printf '\n%-30s %12s %12s\n' "table" "cloud" "this server"
  printf '%-30s %12s %12s\n' "-----" "-----" "-----------"
  while IFS='|' read -r t o; do
    n="$(printf '%s\n' "$new" | awk -F'|' -v t="$t" '$1==t{print $2}')"
    [ "$o" = "-1" ] && o="(none)"
    [ "${n:-}" = "-1" ] && n="(none)"
    printf '%-30s %12s %12s%s\n' "$t" "$o" "${n:-?}" "$([ "$o" = "${n:-}" ] || echo '   <-- differs')"
    [ "$o" = "${n:-}" ] || mismatch=1
  done <<< "$old"
  echo
  if [ "$mismatch" = "1" ]; then
    warn "Row counts differ. If the cloud ERP was still in use after the dump, that is expected"
    warn "(re-run at cutover with the cloud read-only). Otherwise check the restore output."
    return 3
  fi
  log "All row counts match."
}

dump() {
  need_old_url
  docker info >/dev/null 2>&1 || die "Docker must be running (the Supabase CLI runs pg_dump in a container)."
  local dir="${MIGRATION_DIR:-$BACKUP_DIR/cloud-migration/$(date '+%Y-%m-%d_%H%M')}"
  umask 077
  mkdir -p "$dir"
  chmod 700 "$dir"
  log "Dumping the cloud database into $dir (using: $SUPABASE_CLI)"
  # shellcheck disable=SC2086  # SUPABASE_CLI may be "npx --yes supabase"
  $SUPABASE_CLI db dump --db-url "$OLD_DB_URL" -f "$dir/roles.sql" --role-only
  # shellcheck disable=SC2086
  $SUPABASE_CLI db dump --db-url "$OLD_DB_URL" -f "$dir/schema.sql"
  # shellcheck disable=SC2086
  $SUPABASE_CLI db dump --db-url "$OLD_DB_URL" -f "$dir/data.sql" --use-copy --data-only \
    -x "storage.buckets_vectors" -x "storage.vector_indexes"
  local f
  for f in roles.sql schema.sql data.sql; do
    [ -s "$dir/$f" ] || die "$dir/$f is empty; the dump failed."
  done
  grep -q 'COPY "auth"."users"\|COPY auth.users' "$dir/data.sql" \
    || warn "data.sql has no auth.users data: accounts and passwords would NOT come across. Check the CLI version/options."
  ( cd "$dir" && sha256sum roles.sql schema.sql data.sql > SHA256SUMS )
  log "Dump complete: $(du -sh "$dir" | cut -f1) in $dir"
  DUMP_DIR="$dir"
}

restore() {
  local dir="$1" tmpdir="/tmp/licet-cloud-migration"
  require_db_container
  for f in roles.sql schema.sql data.sql; do
    [ -s "$dir/$f" ] || die "$dir/$f is missing or empty."
  done

  if [ "$(db_psql -tAc "SELECT to_regclass('public.profiles') IS NOT NULL")" = "t" ] && [ "$FORCE" != "1" ]; then
    die "This server's database already has ERP tables (public.profiles). Restore only into a fresh Supabase install, or pass --force if you know what you are doing."
  fi

  if [ "$FIX_OWNERS" = "1" ]; then
    log "Commenting out ALTER ... OWNER TO \"supabase_admin\" lines in schema.sql"
    sed -i.orig -E 's/^(ALTER .* OWNER TO "supabase_admin";)$/-- \1/' "$dir/schema.sql"
  fi

  confirm "Restore the cloud dump from $dir into $SUPABASE_DB_CONTAINER on $(hostname)?" RESTORE

  log "Copying dump files into the database container"
  db_exec rm -rf "$tmpdir"
  db_exec mkdir -p "$tmpdir"
  docker cp "$dir/roles.sql" "$SUPABASE_DB_CONTAINER:$tmpdir/roles.sql"
  docker cp "$dir/schema.sql" "$SUPABASE_DB_CONTAINER:$tmpdir/schema.sql"
  docker cp "$dir/data.sql" "$SUPABASE_DB_CONTAINER:$tmpdir/data.sql"

  log "Restoring roles, schema and data in ONE transaction as $DB_USER (all or nothing)"
  set +e
  db_exec psql -h localhost -U "$DB_USER" -d postgres \
    --single-transaction --variable ON_ERROR_STOP=1 \
    --file "$tmpdir/roles.sql" \
    --file "$tmpdir/schema.sql" \
    --command 'SET session_replication_role = replica' \
    --file "$tmpdir/data.sql"
  local rc=$?
  set -e
  db_exec rm -rf "$tmpdir"
  if [ "$rc" != "0" ]; then
    cat >&2 <<EOF

The restore failed and was rolled back; nothing was changed. Common fixes:
  * error mentions "supabase_admin" (owner)  -> re-run with --fix-owners
  * "permission denied to set parameter session_replication_role"
                                            -> re-run with DB_USER=supabase_admin
  * "relation ... already exists"            -> the target is not fresh; reinstall Supabase
  * storage/auth column errors               -> the self-hosted Supabase release is older than
                                               the cloud one; upgrade it (RUNBOOK "Upgrades")
EOF
    exit 1
  fi
  log "Restore committed."

  if [ "$(db_psql -tAc "SELECT to_regclass('supabase_migrations.schema_migrations') IS NOT NULL")" != "t" ]; then
    warn "No migration history came across. Before applying future migrations run:"
    warn "  deploy/scripts/apply-migrations.sh --baseline"
  fi
}

case "$MODE" in
  dump) dump ;;
  verify) verify ;;
  restore)
    restore "$RESTORE_FROM"
    if [ -n "${OLD_DB_URL:-}" ]; then verify || exit $?; else warn "OLD_DB_URL not set; skipped the row-count comparison."; fi
    ;;
  all)
    dump
    restore "$DUMP_DIR"
    verify || rc=$?
    cat <<EOF

Next:
  1. Copy uploaded files:  OLD_SUPABASE_URL=... OLD_SERVICE_ROLE_KEY=... \\
                           NEW_SUPABASE_URL=https://\$API_DOMAIN NEW_SERVICE_ROLE_KEY=... \\
                           node deploy/scripts/copy-storage.mjs
  2. Build and start the ERP: docker compose -f deploy/docker-compose.app.yml up -d --build
  3. Work through the post-migration checklist in deploy/RUNBOOK.md.
  4. Delete $DUMP_DIR once the cutover is signed off (it holds password hashes).
EOF
    exit "${rc:-0}"
    ;;
esac
