#!/usr/bin/env bash
#
# Call the ERP's weekly attendance-alerts job (/api/cron/attendance-alerts)
# with the `x-cron-secret` header = CRON_SECRET from deploy/.env.
# Run from cron on Monday morning (deploy/cron/erp.cron).
#
#   deploy/scripts/run-weekly.sh
#   CRON_PATH=/api/cron/other-job deploy/scripts/run-weekly.sh   # another job

set -euo pipefail
. "$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)/lib.sh"

load_deploy_env
need curl
: "${APP_DOMAIN:?Set APP_DOMAIN in deploy/.env}"
: "${CRON_SECRET:?Set CRON_SECRET in deploy/.env}"
: "${CRON_PATH:=/api/cron/attendance-alerts}"

# The secret goes in a header read from stdin, so it never shows in `ps`.
# --resolve sends the request to Caddy on this machine (no router hairpin needed).
printf 'x-cron-secret: %s\n' "$CRON_SECRET" |
  curl -fsS --max-time 300 --retry 2 --retry-delay 30 \
    --resolve "$APP_DOMAIN:443:127.0.0.1" \
    -X POST -H @- "https://$APP_DOMAIN$CRON_PATH"
echo
