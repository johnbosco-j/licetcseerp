#!/usr/bin/env bash
#
# Update the ERP to the latest code and restart it (a few seconds offline).
#
#   deploy/scripts/deploy-app.sh               # git pull, rebuild, restart, check
#   deploy/scripts/deploy-app.sh --no-pull     # rebuild the code already checked out
#   deploy/scripts/deploy-app.sh --if-changed  # only if the remote branch moved (for cron)
#
# The old container keeps serving until the new image has built. If the new
# version fails its health check, roll back with:
#   git -C <repo> checkout <previous-commit> && deploy/scripts/deploy-app.sh --no-pull

set -euo pipefail
. "$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)/lib.sh"

PULL=1
IF_CHANGED=0
for arg in "$@"; do
  case "$arg" in
    --no-pull) PULL=0 ;;
    --if-changed) IF_CHANGED=1 ;;
    -h|--help) sed -n '2,12p' "$0"; exit 0 ;;
    *) die "Unknown option: $arg" ;;
  esac
done

load_deploy_env
need docker git
[ -f "$DEPLOY_DIR/.env" ] || die "Missing $DEPLOY_DIR/.env (copy .env.example and fill it in)."

if [ "$PULL" = "1" ]; then
  git -C "$REPO_DIR" fetch --quiet
  upstream="$(git -C "$REPO_DIR" rev-parse --abbrev-ref --symbolic-full-name '@{u}')"
  if [ "$IF_CHANGED" = "1" ] && [ "$(git -C "$REPO_DIR" rev-parse HEAD)" = "$(git -C "$REPO_DIR" rev-parse "$upstream")" ]; then
    exit 0
  fi
  before="$(git -C "$REPO_DIR" rev-parse --short HEAD)"
  git -C "$REPO_DIR" merge --ff-only --quiet "$upstream" \
    || die "Cannot fast-forward to $upstream (local changes on the server?). Nothing was deployed."
  log "Code updated $before -> $(git -C "$REPO_DIR" rev-parse --short HEAD)"
  if git -C "$REPO_DIR" diff --name-only "$before" HEAD | grep -q '^supabase/migrations/'; then
    warn "This update includes new database migrations. Take a backup, then run deploy/scripts/apply-migrations.sh."
  fi
fi

log "Building the ERP image"
app_compose build app
log "Restarting"
app_compose up -d

for _ in $(seq 1 30); do
  state="$(docker inspect -f '{{if .State.Health}}{{.State.Health.Status}}{{end}}' licet-erp-app 2>/dev/null || true)"
  [ "$state" = "healthy" ] && break
  sleep 3
done
[ "$state" = "healthy" ] || die "The new ERP container is not healthy: docker logs licet-erp-app"

docker image prune -f >/dev/null 2>&1 || true
log "Deployed $(git -C "$REPO_DIR" rev-parse --short HEAD)"
