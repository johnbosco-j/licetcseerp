#!/usr/bin/env bash
#
# Install self-hosted Supabase for the LICET CSE ERP (official Docker setup).
#
#   sudo deploy/supabase/setup.sh                # fresh install, then start it
#   sudo deploy/supabase/setup.sh --reconfigure  # re-apply LICET settings, keep secrets
#   sudo deploy/supabase/setup.sh --no-start     # install/configure only
#
# What it does (fresh install):
#   1. Sparse-clones docker/ from github.com/supabase/supabase at a pinned
#      self-hosted release tag (SUPABASE_REF) into SUPABASE_DIR.
#   2. Generates every secret with the official utils/generate-keys.sh
#      (JWT secret, anon + service-role keys, Postgres and Studio passwords...).
#   3. Sets the URLs from APP_DOMAIN / API_DOMAIN, turns public sign-up off
#      (the HOD creates accounts with the service-role key), sets SMTP
#      placeholders and adds the `extensions` schema to the API search path.
#   4. Writes docker-compose.override.yml so every Supabase port listens on
#      127.0.0.1 only (Caddy reaches the gateway over the Docker network).
#   5. Copies the API URL, anon key and service-role key into deploy/.env.
#   6. Pulls the images and starts the stack.
#
# Settings come from deploy/.env (APP_DOMAIN, API_DOMAIN, SUPABASE_DIR) or the
# environment. Optional: SUPABASE_REF, SMTP_HOST, SMTP_PORT, SMTP_USER,
# SMTP_PASS, SMTP_ADMIN_EMAIL, SMTP_SENDER_NAME.
#
# Secrets are written to files (mode 600), never printed.

set -euo pipefail

. "$(cd "$(dirname "${BASH_SOURCE[0]}")/../scripts" && pwd)/lib.sh"

# Pinned upstream release. Change deliberately, after reading
# https://github.com/supabase/supabase/blob/master/docker/CHANGELOG.md
DEFAULT_SUPABASE_REF="self-hosted/v0.8.3"
SUPABASE_REPO_URL="${SUPABASE_REPO_URL:-https://github.com/supabase/supabase}"

RECONFIGURE=0
START=1
while [ $# -gt 0 ]; do
  case "$1" in
    --reconfigure) RECONFIGURE=1 ;;
    --no-start) START=0 ;;
    --ref) SUPABASE_REF="$2"; shift ;;
    -h|--help) sed -n '2,25p' "$0"; exit 0 ;;
    *) die "Unknown option: $1 (see --help)" ;;
  esac
  shift
done

load_deploy_env
: "${SUPABASE_REF:=$DEFAULT_SUPABASE_REF}"
: "${APP_DOMAIN:?Set APP_DOMAIN in deploy/.env}"
: "${API_DOMAIN:?Set API_DOMAIN in deploy/.env}"
case "$APP_DOMAIN$API_DOMAIN" in
  *example.*) die "APP_DOMAIN / API_DOMAIN still have the example values. Edit deploy/.env first." ;;
esac

need docker git openssl awk sed grep
docker compose version >/dev/null 2>&1 || die "Docker Compose v2 plugin is missing (docker compose)."

SB_ENV="$SUPABASE_DIR/.env"

# ---- 1-2. fetch the official setup and generate secrets -----------------------
if [ -f "$SB_ENV" ]; then
  [ "$RECONFIGURE" = "1" ] || die "Supabase is already set up in $SUPABASE_DIR. Use --reconfigure to re-apply the LICET settings (secrets are kept)."
  log "Re-applying LICET settings to $SUPABASE_DIR (secrets unchanged)"
else
  if [ -d "$SUPABASE_DIR" ] && [ -n "$(ls -A "$SUPABASE_DIR" 2>/dev/null)" ]; then
    die "$SUPABASE_DIR exists and is not empty, but has no .env. Move it away or pick another SUPABASE_DIR."
  fi
  tmp="$(mktemp -d)"
  trap 'rm -rf "$tmp"' EXIT
  log "Fetching Supabase docker setup at $SUPABASE_REF"
  git clone --quiet --filter=blob:none --no-checkout --depth=1 --branch "$SUPABASE_REF" "$SUPABASE_REPO_URL" "$tmp/supabase" \
    || die "Could not clone $SUPABASE_REF from $SUPABASE_REPO_URL"
  ( cd "$tmp/supabase" && git sparse-checkout init --cone && git sparse-checkout set docker && git checkout --quiet )
  [ -f "$tmp/supabase/docker/docker-compose.yml" ] || die "docker/docker-compose.yml not found at $SUPABASE_REF"

  mkdir -p "$SUPABASE_DIR"
  cp -a "$tmp/supabase/docker/." "$SUPABASE_DIR/"
  cp "$SUPABASE_DIR/.env.example" "$SB_ENV"
  chmod 600 "$SB_ENV"
  # update.sh (the official upgrader) merges future releases against this ref.
  {
    echo "# Supabase self-hosted version stamp. Managed by setup.sh / update.sh."
    echo "# Do not commit or edit by hand. Records the ref this deployment was based on."
    echo "ref=$SUPABASE_REF"
  } > "$SUPABASE_DIR/.supabase-version"

  log "Generating secrets with utils/generate-keys.sh"
  ( cd "$SUPABASE_DIR" && sh utils/generate-keys.sh --update-env >/dev/null )
  rm -f "$SB_ENV.old"
  grep -q '^JWT_SECRET=your-super-secret' "$SB_ENV" && die "Secret generation failed: $SB_ENV still has the default JWT secret."
fi

# ---- 3. LICET settings ----------------------------------------------------------
log "Writing URLs and auth settings"
env_set "$SB_ENV" SUPABASE_PUBLIC_URL "https://$API_DOMAIN"
env_set "$SB_ENV" API_EXTERNAL_URL "https://$API_DOMAIN/auth/v1"
env_set "$SB_ENV" SITE_URL "https://$APP_DOMAIN"
env_set "$SB_ENV" ADDITIONAL_REDIRECT_URLS "https://$APP_DOMAIN/**"
env_set "$SB_ENV" PROXY_DOMAIN "$API_DOMAIN"

# Accounts are created by the HOD (service-role key), never by self sign-up.
# ENABLE_EMAIL_SIGNUP stays true: it is what allows email + password sign-in.
env_set "$SB_ENV" DISABLE_SIGNUP true
env_set "$SB_ENV" ENABLE_EMAIL_SIGNUP true
env_set "$SB_ENV" ENABLE_EMAIL_AUTOCONFIRM false
env_set "$SB_ENV" ENABLE_PHONE_SIGNUP false
env_set "$SB_ENV" ENABLE_PHONE_AUTOCONFIRM false
env_set "$SB_ENV" ENABLE_ANONYMOUS_USERS false

# The ERP's SQL functions call pgcrypto from the `extensions` schema
# (supabase/config.toml has the same search path).
env_set "$SB_ENV" PGRST_DB_EXTRA_SEARCH_PATH "public,extensions"

# SMTP is only used by Supabase Auth's own emails (password recovery links);
# the ERP sends its notifications through Resend. Placeholders unless given.
env_set "$SB_ENV" SMTP_ADMIN_EMAIL "${SMTP_ADMIN_EMAIL:-erp-admin@$APP_DOMAIN}"
env_set "$SB_ENV" SMTP_HOST "${SMTP_HOST:-smtp.CHANGE-ME.invalid}"
env_set "$SB_ENV" SMTP_PORT "${SMTP_PORT:-587}"
env_set "$SB_ENV" SMTP_USER "${SMTP_USER:-CHANGE_ME}"
env_set "$SB_ENV" SMTP_PASS "${SMTP_PASS:-CHANGE_ME}"
env_set "$SB_ENV" SMTP_SENDER_NAME "${SMTP_SENDER_NAME:-LICET CSE ERP}"

env_set "$SB_ENV" STUDIO_DEFAULT_ORGANIZATION "LICET"
env_set "$SB_ENV" STUDIO_DEFAULT_PROJECT "LICET CSE ERP"
env_set "$SB_ENV" OPENAI_API_KEY ""
if [ "$(env_get "$SB_ENV" POOLER_TENANT_ID)" = "your-tenant-id" ]; then
  env_set "$SB_ENV" POOLER_TENANT_ID "licet-erp"
fi

# ---- 4. loopback-only ports ----------------------------------------------------
# Docker-published ports bypass ufw, so bind them to 127.0.0.1 explicitly.
cat > "$SUPABASE_DIR/docker-compose.override.yml" <<'YAML'
# LICET CSE ERP (written by deploy/supabase/setup.sh; edit there, not here).
# Every Supabase port listens on the loopback interface only. Caddy
# (deploy/docker-compose.app.yml) reaches the API gateway over the Docker
# network; admins reach Studio and Postgres through an SSH tunnel.
services:
  api-gw:
    ports: !override
      - "127.0.0.1:${API_GW_HTTP_PORT:-8000}:8000/tcp"
  supavisor:
    ports: !override
      - "127.0.0.1:${POSTGRES_PORT}:5432"
      - "127.0.0.1:${POOLER_PROXY_PORT_TRANSACTION}:6543"
YAML
compose_files="$(env_get "$SB_ENV" COMPOSE_FILE)"
[ -n "$compose_files" ] || compose_files="docker-compose.yml"
case ":$compose_files:" in
  *:docker-compose.override.yml:*) ;;
  *) env_set "$SB_ENV" COMPOSE_FILE "$compose_files:docker-compose.override.yml" ;;
esac
chmod 600 "$SB_ENV"

# ---- 5. hand the keys to the app ------------------------------------------------
APP_ENV="$DEPLOY_DIR/.env"
if [ ! -f "$APP_ENV" ]; then
  cp "$DEPLOY_DIR/.env.example" "$APP_ENV"
  log "Created $APP_ENV from .env.example"
fi
chmod 600 "$APP_ENV"
env_set "$APP_ENV" NEXT_PUBLIC_SUPABASE_URL "https://$API_DOMAIN"
env_set "$APP_ENV" NEXT_PUBLIC_SUPABASE_ANON_KEY "$(env_get "$SB_ENV" ANON_KEY)"
env_set "$APP_ENV" SUPABASE_SERVICE_ROLE_KEY "$(env_get "$SB_ENV" SERVICE_ROLE_KEY)"
env_set "$APP_ENV" SUPABASE_DIR "$SUPABASE_DIR"
if [ -z "$(env_get "$APP_ENV" CRON_SECRET)" ]; then
  env_set "$APP_ENV" CRON_SECRET "$(openssl rand -hex 32)"
fi
log "deploy/.env now has the API URL, anon key, service-role key and a CRON_SECRET"

# ---- 6. start ------------------------------------------------------------------
if [ "$START" = "1" ]; then
  log "Pulling images (this takes a few minutes the first time)"
  supabase_compose pull --quiet
  log "Starting Supabase"
  supabase_compose up -d
  log "Waiting for the database, auth and storage to become healthy"
  for _ in $(seq 1 60); do
    ok=1
    for c in supabase-db supabase-auth supabase-storage supabase-rest; do
      state="$(docker inspect -f '{{if .State.Health}}{{.State.Health.Status}}{{else}}{{.State.Status}}{{end}}' "$c" 2>/dev/null || echo missing)"
      case "$state" in healthy|running) ;; *) ok=0 ;; esac
    done
    [ "$ok" = "1" ] && break
    sleep 5
  done
  [ "$ok" = "1" ] || die "Supabase did not become healthy in 5 minutes. Check: cd $SUPABASE_DIR && docker compose ps && docker compose logs --tail=100"
  log "Supabase is up"
fi

cat <<EOF

Supabase is installed in $SUPABASE_DIR (release $SUPABASE_REF).
Secrets: $SB_ENV (mode 600). Back this file up somewhere safe and offline.

Next steps (deploy/RUNBOOK.md):
  * Clean install:     deploy/scripts/apply-migrations.sh
  * Move from cloud:   deploy/scripts/migrate-from-cloud.sh
  * Then start the ERP: docker compose -f deploy/docker-compose.app.yml up -d --build
  * Studio (admin UI): ssh -L 8000:127.0.0.1:8000 <you>@<server>, then open http://localhost:8000
    (user/password: DASHBOARD_USERNAME / DASHBOARD_PASSWORD in $SB_ENV)
  * Real SMTP for Auth emails: edit SMTP_* in $SB_ENV, then: cd $SUPABASE_DIR && docker compose up -d
EOF
