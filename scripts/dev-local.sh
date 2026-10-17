#!/usr/bin/env bash
# Runs the app against the LOCAL Supabase (supabase start) on port 3100 for end-to-end testing.
set -euo pipefail
cd "$(dirname "$0")/.."
eval "$(supabase status -o env | grep -E '^(API_URL|ANON_KEY|SERVICE_ROLE_KEY)=')"
export NEXT_PUBLIC_SUPABASE_URL="$API_URL" NEXT_PUBLIC_SUPABASE_ANON_KEY="$ANON_KEY" SUPABASE_SERVICE_ROLE_KEY="$SERVICE_ROLE_KEY"
exec npx next dev -p "${PORT:-3100}"
