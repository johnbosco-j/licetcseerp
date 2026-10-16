# Self-hosted Supabase for the LICET CSE ERP

The ERP needs Supabase's Postgres, Auth, the REST API (PostgREST) and Storage. On the college server these run from the **official Supabase Docker setup** (`docker/` in github.com/supabase/supabase), pinned to a release tag. `setup.sh` installs and configures it; nothing in this folder replaces upstream files.

## Install

```bash
# deploy/.env must already have APP_DOMAIN, API_DOMAIN and SUPABASE_DIR
sudo deploy/supabase/setup.sh
```

It:

1. sparse-clones `docker/` at `self-hosted/v0.8.3` (override with `--ref` or `SUPABASE_REF`) into `SUPABASE_DIR` (default `/opt/licet/supabase`) and writes `.supabase-version`, so the official `update.sh` can upgrade it later;
2. generates every secret with the official `utils/generate-keys.sh` (JWT secret, anon and service-role keys, Postgres and Studio passwords, encryption keys), without printing them;
3. sets `SUPABASE_PUBLIC_URL=https://API_DOMAIN`, `API_EXTERNAL_URL=https://API_DOMAIN/auth/v1`, `SITE_URL=https://APP_DOMAIN`;
4. turns public sign-up off (`DISABLE_SIGNUP=true`, phone and anonymous sign-in off). Accounts are created only by the HOD through the ERP, which uses the service-role key. Email + password sign-in stays on;
5. adds `extensions` to the API search path (the ERP's SQL functions use `pgcrypto` from that schema, as `supabase/config.toml` does);
6. writes SMTP placeholders (`SMTP_*`). Supabase Auth only emails password-recovery links, which the ERP does not use (the HOD, password admins and class advisors reset passwords), so real SMTP is optional;
7. writes `docker-compose.override.yml` so the gateway (8000) and the Postgres pooler (5432/6543) listen on **127.0.0.1 only**. Docker-published ports bypass `ufw`, so this matters;
8. copies the API URL, anon key and service-role key into `deploy/.env` and creates a `CRON_SECRET`;
9. pulls the images, starts the stack and waits until it is healthy.

`sudo deploy/supabase/setup.sh --reconfigure` re-applies steps 3 to 8 to an existing install without touching the secrets (for example after a domain change).

## Where things are

| What | Where |
| --- | --- |
| Secrets and settings | `$SUPABASE_DIR/.env` (mode 600; backed up nightly in `config.tar.gz`) |
| Database files | `$SUPABASE_DIR/volumes/db/data` |
| Uploaded files | `$SUPABASE_DIR/volumes/storage` |
| Containers | `supabase-db`, `supabase-auth`, `supabase-rest`, `supabase-storage`, `supabase-envoy` (gateway), `supabase-studio`, ... |
| Docker network | `supabase_default` (Caddy joins it to reach `api-gw:8000`) |

## Studio (admin dashboard)

Not published on the internet. From your own computer:

```bash
ssh -L 8000:127.0.0.1:8000 admin@<server>
# then open http://localhost:8000 and sign in with DASHBOARD_USERNAME / DASHBOARD_PASSWORD
```

## Database

- Fresh install: `deploy/scripts/apply-migrations.sh` applies `supabase/migrations/*.sql` in order.
- Moving from Supabase cloud: `deploy/scripts/migrate-from-cloud.sh`, then `deploy/scripts/copy-storage.mjs` for the files.
- A `psql` shell: `docker exec -it supabase-db psql -U postgres`.

## Upgrades

Read the [self-hosted CHANGELOG](https://github.com/supabase/supabase/blob/master/docker/CHANGELOG.md) first, take a backup, then use the official updater:

```bash
sudo deploy/scripts/backup.sh
cd /opt/licet/supabase
sh update.sh --dry-run
sh update.sh --to self-hosted/vX.Y.Z
docker compose pull && docker compose up -d
```

`update.sh` keeps `.env` values and `docker-compose.override.yml`. Afterwards run `deploy/scripts/healthcheck.sh`. Some Storage releases have one-way database migrations; rolling back then means restoring the backup.
