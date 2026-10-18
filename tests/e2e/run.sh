#!/usr/bin/env bash
# End-to-end checks against the LOCAL stack: supabase start, then
#   SUPABASE_URL=http://127.0.0.1:54321 SUPABASE_SERVICE_ROLE_KEY=... node scripts/seed-local.mjs
#   bash tests/e2e/run.sh
set -euo pipefail
cd "$(dirname "$0")/../.."
# the CLI prints JSON (older versions printed KEY="value" lines)
eval "$(supabase status -o json 2>/dev/null | python3 -c 'import json,sys; d=json.load(sys.stdin); print("\n".join(f"{k}={d[k]!r}" for k in ("API_URL","ANON_KEY","SERVICE_ROLE_KEY")))')"
export API_URL ANON_KEY SERVICE_ROLE_KEY STATION_PORT=${STATION_PORT:-7071}
(cd station && SUPABASE_URL=$API_URL SUPABASE_ANON_KEY=$ANON_KEY node server.mjs > /tmp/licet-station-e2e.log 2>&1) &
STATION_PID=$!
trap 'kill $STATION_PID 2>/dev/null || true' EXIT
sleep 2
node tests/e2e/station.mjs | tee /tmp/licet-e2e.out
node tests/e2e/two-step.mjs | tee -a /tmp/licet-e2e.out
npx --yes tsx tests/e2e/ai-tools.mts | tee -a /tmp/licet-e2e.out
npx --yes tsx tests/e2e/ai-actions.mts | tee -a /tmp/licet-e2e.out
fails=$(grep -c ' FAIL ' /tmp/licet-e2e.out || true)
echo; echo "$(grep -c ' PASS ' /tmp/licet-e2e.out) passed, $fails failed"
[ "$fails" = 0 ]
