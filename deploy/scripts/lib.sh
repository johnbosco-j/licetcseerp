# Shared helpers for the deploy/ scripts. Source it; do not run it.
#   . "$(dirname "$0")/lib.sh"      (from deploy/scripts)

DEPLOY_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
REPO_DIR="$(cd "$DEPLOY_DIR/.." && pwd)"
APP_COMPOSE="$DEPLOY_DIR/docker-compose.app.yml"

log()  { printf '[%s] %s\n' "$(date '+%Y-%m-%d %H:%M:%S')" "$*"; }
warn() { printf '[%s] WARNING: %s\n' "$(date '+%Y-%m-%d %H:%M:%S')" "$*" >&2; }
die()  { printf '[%s] ERROR: %s\n' "$(date '+%Y-%m-%d %H:%M:%S')" "$*" >&2; exit 1; }

# load_env FILE: read KEY=value lines without executing them. Variables that
# are already set in the environment win, so `KEEP_DAILY=30 backup.sh` works.
load_env() {
  local file="$1" line key value
  [ -f "$file" ] || return 0
  while IFS= read -r line || [ -n "$line" ]; do
    line="${line%$'\r'}"
    case "$line" in ''|'#'*) continue ;; esac
    [[ "$line" =~ ^[A-Za-z_][A-Za-z0-9_]*= ]] || continue
    key="${line%%=*}"
    value="${line#*=}"
    if [[ "$value" =~ ^\"(.*)\"$ ]] || [[ "$value" =~ ^\'(.*)\'$ ]]; then
      value="${BASH_REMATCH[1]}"
    fi
    if [ -z "${!key+x}" ]; then
      export "$key=$value"
    fi
  done < "$file"
}

# env_get FILE KEY: print one value from an env file (no quotes stripped beyond a pair).
env_get() {
  local v
  v="$(grep -E "^$2=" "$1" 2>/dev/null | head -n1 | cut -d= -f2-)" || true
  v="${v%$'\r'}"
  if [[ "$v" =~ ^\"(.*)\"$ ]] || [[ "$v" =~ ^\'(.*)\'$ ]]; then v="${BASH_REMATCH[1]}"; fi
  printf '%s' "$v"
}

# env_set FILE KEY VALUE: replace KEY=... or append it. VALUE is written as-is.
env_set() {
  local file="$1" key="$2" value="$3" tmp
  tmp="$(mktemp "${file}.XXXXXX")"
  if grep -qE "^${key}=" "$file"; then
    # ENVIRON (not awk -v) so backslashes in secrets are copied literally.
    K="$key" V="$value" awk 'BEGIN{FS="="; k=ENVIRON["K"]; v=ENVIRON["V"]}
      $1==k && !done {print k "=" v; done=1; next} {print}' "$file" > "$tmp"
  else
    cat "$file" > "$tmp"
    printf '%s=%s\n' "$key" "$value" >> "$tmp"
  fi
  chmod --reference="$file" "$tmp" 2>/dev/null || chmod 600 "$tmp"
  mv "$tmp" "$file"
}

need() {
  local c
  for c in "$@"; do
    command -v "$c" >/dev/null 2>&1 || die "'$c' is required but not installed."
  done
}

# Load deploy/.env (if present) and set defaults.
load_deploy_env() {
  load_env "$DEPLOY_DIR/.env"
  : "${SUPABASE_DIR:=/opt/licet/supabase}"
  : "${SUPABASE_DB_CONTAINER:=supabase-db}"
  : "${BACKUP_DIR:=/var/backups/licet-erp}"
  export SUPABASE_DIR SUPABASE_DB_CONTAINER BACKUP_DIR
}

# Run psql / pg tools inside the Supabase Postgres container as the superuser.
# The container already has PGPASSWORD (= POSTGRES_PASSWORD) in its environment.
db_exec() {
  docker exec -i "$SUPABASE_DB_CONTAINER" "$@"
}
db_psql() {
  local user="${DB_USER:-postgres}"
  db_exec psql -h localhost -U "$user" -d "${DB_NAME:-postgres}" -v ON_ERROR_STOP=1 "$@"
}

require_db_container() {
  docker inspect -f '{{.State.Running}}' "$SUPABASE_DB_CONTAINER" 2>/dev/null | grep -q true \
    || die "Container '$SUPABASE_DB_CONTAINER' is not running. Start Supabase first: cd $SUPABASE_DIR && docker compose up -d"
}

supabase_compose() {
  ( cd "$SUPABASE_DIR" && docker compose "$@" )
}

app_compose() {
  docker compose -f "$APP_COMPOSE" "$@"
}

# confirm "question" WORD: the user must type WORD exactly. ASSUME_YES=1 skips.
confirm() {
  local answer
  if [ "${ASSUME_YES:-0}" = "1" ]; then return 0; fi
  [ -t 0 ] || die "Needs confirmation; run interactively or pass --yes."
  printf '%s\nType %s to continue: ' "$1" "$2"
  read -r answer
  [ "$answer" = "$2" ] || die "Not confirmed; nothing was changed."
}
