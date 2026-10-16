#!/usr/bin/env bash
#
# Is the ERP healthy? Prints one line per check and exits non-zero if any fail.
#
#   deploy/scripts/healthcheck.sh           # full report
#   deploy/scripts/healthcheck.sh --quiet   # print only problems (for cron/MAILTO)
#
# Checks: containers running/healthy, the ERP answering over HTTPS, the
# Supabase auth + database API answering, the database accepting queries,
# disk space, age of the last backup, and certificate expiry.

set -euo pipefail
. "$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)/lib.sh"

QUIET=0
[ "${1:-}" = "--quiet" ] && QUIET=1

load_deploy_env
: "${DISK_WARN_PERCENT:=85}"
: "${BACKUP_MAX_AGE_HOURS:=26}"
: "${CERT_WARN_DAYS:=14}"
need docker curl

failures=0
ok()   { [ "$QUIET" = "1" ] || printf '  OK    %s\n' "$*"; }
bad()  { printf '  FAIL  %s\n' "$*"; failures=$((failures + 1)); }
note() { printf '  WARN  %s\n' "$*"; }

[ "$QUIET" = "1" ] || echo "LICET CSE ERP health on $(hostname) at $(date '+%Y-%m-%d %H:%M')"

# ---- containers -------------------------------------------------------------------
for c in licet-erp-app licet-erp-caddy supabase-db supabase-auth supabase-rest supabase-storage; do
  state="$(docker inspect -f '{{.State.Status}}{{if .State.Health}}/{{.State.Health.Status}}{{end}}' "$c" 2>/dev/null || echo missing)"
  case "$state" in
    running|running/healthy) ok "container $c ($state)" ;;
    *) bad "container $c is $state" ;;
  esac
done
gw="$(docker ps --format '{{.Names}}' | grep -E '^supabase-(envoy|kong)$' | head -n1 || true)"
if [ -n "$gw" ]; then ok "API gateway container $gw running"; else bad "API gateway container (supabase-envoy / supabase-kong) not running"; fi

# ---- HTTPS endpoints ---------------------------------------------------------------
# --resolve sends the request to this machine even if the router cannot loop
# back to its own public address; TLS is still checked against the real name.
https_code() {  # https_code DOMAIN PATH [curl args...]
  local d="$1" p="$2"; shift 2
  curl -sS -o /dev/null -w '%{http_code}' --max-time 15 --resolve "$d:443:127.0.0.1" "$@" "https://$d$p" 2>/dev/null || echo 000
}

if [ -n "${APP_DOMAIN:-}" ]; then
  code="$(https_code "$APP_DOMAIN" /manifest.webmanifest)"
  [ "$code" = "200" ] && ok "ERP https://$APP_DOMAIN answers" || bad "ERP https://$APP_DOMAIN/manifest.webmanifest returned HTTP $code"
  code="$(https_code "$APP_DOMAIN" /login)"
  [ "$code" = "200" ] && ok "login page loads" || bad "https://$APP_DOMAIN/login returned HTTP $code"
else
  note "APP_DOMAIN not set in deploy/.env; skipped the HTTPS checks"
fi

if [ -n "${API_DOMAIN:-}" ] && [ -n "${NEXT_PUBLIC_SUPABASE_ANON_KEY:-}" ]; then
  code="$(https_code "$API_DOMAIN" /auth/v1/health -H "apikey: $NEXT_PUBLIC_SUPABASE_ANON_KEY")"
  [ "$code" = "200" ] && ok "Supabase Auth answers" || bad "https://$API_DOMAIN/auth/v1/health returned HTTP $code"
  code="$(https_code "$API_DOMAIN" '/rest/v1/departments?select=id&limit=1' -H "apikey: $NEXT_PUBLIC_SUPABASE_ANON_KEY")"
  case "$code" in 200|401) ok "Supabase database API answers (HTTP $code)" ;; *) bad "https://$API_DOMAIN/rest/v1/ returned HTTP $code" ;; esac
  code="$(https_code "$API_DOMAIN" /)"
  [ "$code" = "404" ] && ok "Studio is not public on $API_DOMAIN" || note "https://$API_DOMAIN/ returned HTTP $code (expected 404: Studio should not be public)"
fi

# ---- database ----------------------------------------------------------------------------
if docker exec "$SUPABASE_DB_CONTAINER" psql -h localhost -U postgres -d postgres -tAc 'SELECT 1' >/dev/null 2>&1; then
  ok "database accepts queries"
  conns="$(docker exec "$SUPABASE_DB_CONTAINER" psql -h localhost -U postgres -d postgres -tAc 'SELECT count(*) FROM pg_stat_activity' 2>/dev/null || echo '?')"
  ok "database connections: $conns"
else
  bad "database does not answer (container $SUPABASE_DB_CONTAINER)"
fi

# ---- disk --------------------------------------------------------------------------------
seen=" "
for path in / "$SUPABASE_DIR" "$BACKUP_DIR" /var/lib/docker; do
  [ -e "$path" ] || continue
  mount="$(df -P "$path" | awk 'NR==2{print $6}')"
  case "$seen" in *" $mount "*) continue ;; esac
  seen+="$mount "
  use="$(df -P "$path" | awk 'NR==2{gsub("%","",$5); print $5}')"
  if [ "$use" -ge "$DISK_WARN_PERCENT" ]; then bad "disk $mount is ${use}% full (for $path)"; else ok "disk $mount ${use}% used"; fi
done

# ---- backups -------------------------------------------------------------------------------
if [ -f "$BACKUP_DIR/last_success" ]; then
  last="$(cat "$BACKUP_DIR/last_success")"
  age_h=$(( ( $(date +%s) - $(date -d "$last" +%s 2>/dev/null || echo 0) ) / 3600 ))
  if [ "$age_h" -le "$BACKUP_MAX_AGE_HOURS" ]; then ok "last backup $age_h h ago"; else bad "last successful backup was $age_h h ago ($last)"; fi
else
  bad "no successful backup recorded in $BACKUP_DIR/last_success"
fi

# ---- certificates --------------------------------------------------------------------------
if command -v openssl >/dev/null 2>&1; then
  domains="${APP_DOMAIN:-}"
  [ -n "${API_DOMAIN:-}" ] && [ "${API_DOMAIN:-}" != "${APP_DOMAIN:-}" ] && domains="$domains $API_DOMAIN"
  for d in $domains; do
    end="$(echo | openssl s_client -connect 127.0.0.1:443 -servername "$d" 2>/dev/null | openssl x509 -noout -enddate 2>/dev/null | cut -d= -f2 || true)"
    if [ -z "$end" ]; then bad "could not read the TLS certificate for $d"; continue; fi
    days=$(( ( $(date -d "$end" +%s) - $(date +%s) ) / 86400 ))
    if [ "$days" -ge "$CERT_WARN_DAYS" ]; then ok "certificate for $d valid for $days more days"; else bad "certificate for $d expires in $days days (Caddy should renew it; check: docker logs licet-erp-caddy)"; fi
  done
fi

if [ "$failures" -gt 0 ]; then
  echo "$failures check(s) failed."
  exit 1
fi
[ "$QUIET" = "1" ] || echo "All checks passed."
