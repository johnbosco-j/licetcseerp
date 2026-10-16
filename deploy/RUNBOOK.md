# LICET CSE ERP: on-premise runbook

For the college IT administrator. It moves the ERP from Vercel + Supabase cloud onto one college server and covers running it afterwards. Run every command on the server from the repository checkout (`/opt/licet/erp` below) unless it says otherwise.

```
 browsers / phones / Attendance Station laptops
        │ HTTPS 443
        ▼
 ┌──────────────────────────── college server ────────────────────────────┐
 │ Caddy (TLS, Let's Encrypt)                                             │
 │   APP_DOMAIN ──▶ app (Next.js, container licet-erp-app :3000)          │
 │   API_DOMAIN ──▶ Supabase gateway api-gw :8000                         │
 │                   ├─ auth (sign-in)   ├─ rest (PostgREST)              │
 │                   ├─ storage (files)  └─ realtime                      │
 │                   └──────────▶ Postgres (supabase-db, never public)    │
 │ cron: backup 01:30 · alerts Mon 07:00 · health every 15 min            │
 └────────────────────────────────────────────────────────────────────────┘
```

## Contents

1. [What you need](#1-what-you-need)
2. [Prepare the server](#2-prepare-the-server)
3. [DNS and certificates](#3-dns-and-certificates)
4. [Install Supabase](#4-install-supabase)
5. [Install the ERP](#5-install-the-erp)
6. [Move the data from Supabase cloud](#6-move-the-data-from-supabase-cloud)
7. [Post-migration checklist](#7-post-migration-checklist)
8. [Backups and restore tests](#8-backups-and-restore-tests)
9. [Upgrades](#9-upgrades)
10. [Key rotation](#10-key-rotation)
11. [Monitoring and disk space](#11-monitoring-and-disk-space)
12. [Security hardening](#12-security-hardening)
13. [Attendance Station laptops](#13-attendance-station-laptops)
14. [Troubleshooting](#14-troubleshooting)

---

## 1. What you need

| | Minimum | Recommended |
| --- | --- | --- |
| CPU | 2 cores | 4 cores |
| RAM | 4 GB | 8 GB |
| Disk | 40 GB SSD | 80 GB SSD (backups live on the same disk until copied off-site) |
| OS | Ubuntu Server 22.04 or 24.04 LTS, 64-bit | same |
| Network | Public IP (or a port-forward) with TCP 80 and 443 open from the internet | same, plus a static LAN IP |

Also:

- **Two DNS names** from the college, e.g. `erp.licet.ac.in` (the ERP) and `erp-api.licet.ac.in` (the API). One name also works; see [3](#3-dns-and-certificates).
- An **off-site backup destination**: a NAS reachable over SSH, or a cloud drive via `rclone`.
- Access to the current **Supabase cloud project** (database password, service-role key) and the **Vercel** project, for the migration.
- Optional: a **Resend** API key and verified sender domain for ERP emails (absence alerts, leave and grievance updates). The ERP already uses one on Vercel; reuse it.

Decisions to make before you start:

1. **Internet or campus only?** Students and parents use the ERP from home, so the recommended setup is reachable from the internet. If the college wants campus-only access, certificates need the DNS challenge or a college certificate ([3](#3-dns-and-certificates)), and the Attendance Station laptops must be on the campus network.
2. **Two hostnames or one?** Two is the default and keeps the API separate.
3. **Where do off-site backups go?** Without one, a disk failure loses everything.

## 2. Prepare the server

Log in as a sudo user.

```bash
# Updates, time zone, basic tools
sudo apt update && sudo apt -y full-upgrade
sudo timedatectl set-timezone Asia/Kolkata
sudo apt -y install git curl jq openssl ufw fail2ban unattended-upgrades rsync ca-certificates

# Automatic security updates
sudo dpkg-reconfigure -plow unattended-upgrades
```

**Docker Engine + Compose plugin** (official repository):

```bash
curl -fsSL https://get.docker.com -o /tmp/get-docker.sh
less /tmp/get-docker.sh          # read it first
sudo sh /tmp/get-docker.sh
sudo usermod -aG docker "$USER"  # log out and back in afterwards
docker compose version           # must be v2.24 or newer
```

Limit Docker's own logs so they cannot fill the disk. Create `/etc/docker/daemon.json`:

```json
{ "log-driver": "json-file", "log-opts": { "max-size": "10m", "max-file": "5" } }
```

then `sudo systemctl restart docker`.

**SSH: keys only.** Put your public key in `~/.ssh/authorized_keys`, check you can log in with it from a second terminal, then in `/etc/ssh/sshd_config` (or a file in `/etc/ssh/sshd_config.d/`):

```
PasswordAuthentication no
PermitRootLogin no
KbdInteractiveAuthentication no
```

`sudo systemctl restart ssh`, and test again from a new terminal before closing the old one.

**Firewall: only SSH, 80 and 443.**

```bash
sudo ufw default deny incoming
sudo ufw default allow outgoing
sudo ufw allow OpenSSH          # better: sudo ufw allow from <IT admin subnet> to any port 22
sudo ufw allow 80/tcp
sudo ufw allow 443/tcp
sudo ufw allow 443/udp          # HTTP/3
sudo ufw enable
```

Docker-published ports bypass `ufw`. That is why every Supabase port is bound to `127.0.0.1` (see [12](#12-security-hardening)); only Caddy publishes 80/443.

**Get the code:**

```bash
sudo mkdir -p /opt/licet && sudo chown "$USER" /opt/licet
git clone <repository-url> /opt/licet/erp
cd /opt/licet/erp
cp deploy/.env.example deploy/.env
chmod 600 deploy/.env
nano deploy/.env    # APP_DOMAIN, API_DOMAIN, ACME_EMAIL, RESEND_API_KEY, EMAIL_FROM, backup settings
```

## 3. DNS and certificates

Ask the college DNS administrator for:

| Name | Type | Value |
| --- | --- | --- |
| `erp.licet.ac.in` (APP_DOMAIN) | A | public IP of the server |
| `erp-api.licet.ac.in` (API_DOMAIN) | A | public IP of the server |

(Add AAAA records only if the server really has working IPv6.) Check with `dig +short erp.licet.ac.in` before continuing. If the router forwards 80/443 to the server, the forward must exist before the first start, or the certificate requests fail.

Inside campus, a split-DNS record pointing both names to the server's LAN IP keeps campus traffic off the internet link. It is optional.

**Certificates.** Caddy gets and renews Let's Encrypt certificates on its own. It needs both names to resolve to the server and port 80 reachable from the internet. Alternatives:

- **College certificate** (e.g. a wildcard `*.licet.ac.in`): put `cert.pem` and `key.pem` in `deploy/caddy/certs/` (git-ignored by `*.pem`), mount the folder in `docker-compose.app.yml` (`- ./caddy/certs:/certs:ro` under `caddy.volumes`) and add `tls /certs/cert.pem /certs/key.pem` inside both site blocks of the Caddyfile. You must renew it yourself.
- **Campus-only server** (no inbound internet): Let's Encrypt's HTTP check cannot reach it. Use a college certificate as above, or a DNS-challenge Caddy build for the college's DNS provider.

**Only one hostname?** Set `API_DOMAIN` equal to `APP_DOMAIN` and `CADDYFILE=Caddyfile.single-domain` in `deploy/.env`. The API is then served under `https://erp.licet.ac.in/auth/v1`, `/rest/v1`, `/storage/v1` and `/realtime/v1`, which never clash with the ERP's own pages.

## 4. Install Supabase

```bash
cd /opt/licet/erp
sudo deploy/supabase/setup.sh
```

This installs the official Supabase Docker setup (pinned release) into `/opt/licet/supabase`, generates all secrets, turns public sign-up off, binds every port to localhost, writes the API keys into `deploy/.env` and starts the stack. Details: [deploy/supabase/README.md](supabase/README.md).

Afterwards:

- **Copy `/opt/licet/supabase/.env` to a safe offline place** (an encrypted USB key in the HOD's office, a password manager). It holds the JWT secret and database password. Without it, a backup can still be restored, but every key changes.
- `cd /opt/licet/supabase && docker compose ps` should show every service `healthy`/`running`.

## 5. Install the ERP

**Clean install** (new department, no cloud data): create the tables, then the accounts.

```bash
sudo deploy/scripts/apply-migrations.sh          # applies supabase/migrations/*.sql in order
```

**Moving from the cloud:** skip `apply-migrations.sh` and do [6](#6-move-the-data-from-supabase-cloud) first.

Build and start the ERP and Caddy:

```bash
docker compose -f deploy/docker-compose.app.yml up -d --build
docker compose -f deploy/docker-compose.app.yml logs -f caddy    # watch the certificates arrive; Ctrl-C to stop
```

`NEXT_PUBLIC_SUPABASE_URL` and the anon key are compiled into the ERP at build time, so after changing them in `deploy/.env` run `deploy/scripts/deploy-app.sh --no-pull` to rebuild.

Install the scheduled jobs:

```bash
sudo mkdir -p /var/log/licet-erp
sudo install -m 644 deploy/cron/erp.cron /etc/cron.d/licet-erp            # edit ERP_HOME if not /opt/licet/erp
sudo install -m 644 deploy/cron/licet-erp.logrotate /etc/logrotate.d/licet-erp
sudo deploy/scripts/backup.sh                                               # first backup now
deploy/scripts/healthcheck.sh
```

For a clean install, create the first accounts with the scripts in `scripts/` (they read `.env.local`; point it at the new API URL and service-role key), as in the main README.

## 6. Move the data from Supabase cloud

Plan: **rehearse** on the new server, wipe it, then do the real **cutover** over a weekend, **run both in parallel** for a few days, and keep a **rollback** path.

### 6.1 What moves and what does not

| Moves | How |
| --- | --- |
| All tables, views, functions, RLS policies | `migrate-from-cloud.sh` (schema + data dump) |
| Accounts **and their password hashes** (`auth.users`) | in the data dump: users keep their passwords |
| File records (`storage.objects`) | in the data dump |
| The files themselves (question papers, NAAC documents, archives...) | `copy-storage.mjs` |
| Sessions / sign-ins | **No.** The new server has a new JWT secret, so everyone signs in once more (same password) |
| Vault secrets | Not used by the ERP |

### 6.2 Rehearsal (any weekday, no downtime)

1. Install Supabase on the new server ([4](#4-install-supabase)). Do **not** run `apply-migrations.sh`.
2. Get the cloud connection string: Supabase dashboard → **Connect** → **Session pooler** URI (IPv4; the direct `db.<ref>.supabase.co` address is IPv6-only). Fill in the database password.
3. Install the Supabase CLI (or let the script use `npx supabase`; Node.js 20+ needed): see https://supabase.com/docs/guides/local-development/cli/getting-started.
4. Run:

   ```bash
   export OLD_DB_URL='postgresql://postgres.<ref>:<db-password>@aws-0-<region>.pooler.supabase.com:5432/postgres'
   sudo -E deploy/scripts/migrate-from-cloud.sh
   ```

   It dumps `roles.sql`, `schema.sql` and `data.sql` (the official `supabase db dump` commands), restores them in **one transaction** (all or nothing), then prints row counts for `auth.users`, `profiles`, `subjects`, `attendance_sessions`, `attendance`, `timetable_entries`, `calendar_days`, `marks`, `audit_log` and the storage tables, cloud vs. server. During a rehearsal the cloud is still in use, so small differences are normal.

   If the restore fails it rolls back and prints the fix. The usual ones:
   - errors about `supabase_admin` ownership: re-run with `--restore-only <dump dir> --fix-owners` (comments out the `ALTER ... OWNER TO "supabase_admin"` lines);
   - `permission denied to set parameter session_replication_role`: re-run with `DB_USER=supabase_admin`.
5. Record the migration history so future migrations apply cleanly (if the script warned about it):

   ```bash
   sudo deploy/scripts/apply-migrations.sh --baseline
   ```

6. Copy the files (from the repository root, after `npm ci`):

   ```bash
   OLD_SUPABASE_URL=https://<ref>.supabase.co OLD_SERVICE_ROLE_KEY=<cloud service-role key> \
   NEW_SUPABASE_URL=https://erp-api.licet.ac.in NEW_SERVICE_ROLE_KEY=<SUPABASE_SERVICE_ROLE_KEY from deploy/.env> \
   node deploy/scripts/copy-storage.mjs
   ```

   Add `--resume` to continue an interrupted copy. Type the keys on the command line or `export` them in the shell; never save them in a file in the repository.
7. **Run the database test suite** against the new database. It must pass before you go further:

   ```bash
   # from the repository root, with psql installed (sudo apt install postgresql-client)
   # the pooler on 127.0.0.1:5432 needs the tenant id in the user name
   DATABASE_URL="postgresql://postgres.licet-erp:<POSTGRES_PASSWORD>@127.0.0.1:5432/postgres" npm run test:db
   ```

   `POSTGRES_PASSWORD` and `POOLER_TENANT_ID` (default `licet-erp`) are in `/opt/licet/supabase/.env`.
8. Start the ERP ([5](#5-install-the-erp)) and walk through the checklist in [7](#7-post-migration-checklist) with the HOD.
9. Write down how long each step took. Then reset the server for the real run:

   ```bash
   docker compose -f deploy/docker-compose.app.yml down
   cd /opt/licet/supabase && docker compose down -v && sudo rm -rf volumes/db/data/* volumes/storage/*
   docker compose up -d       # fresh, empty database with the same secrets
   ```

### 6.3 Cutover weekend

Announce it a week ahead: "The ERP moves to https://erp.licet.ac.in on Saturday. It is read-only from Friday 18:00. Sign in again on Monday with your usual password."

1. **Friday evening, freeze the cloud.** Tell faculty not to enter data. To enforce it, pause writes in the cloud SQL editor (Supabase dashboard): revoke `INSERT, UPDATE, DELETE` on all tables in schema `public` from `authenticated` (note the exact statement so you can undo it), or simply pause the Vercel deployment.
2. Take a final backup of the cloud from the Supabase dashboard (Database → Backups) and keep the dump files from step 3.
3. Run steps 4–7 of the rehearsal. This time the row counts **must match exactly**; if they do not, stop and investigate.
4. Copy the Resend settings (`RESEND_API_KEY`, `EMAIL_FROM`) from Vercel into `deploy/.env`.
5. Start the ERP, check [7](#7-post-migration-checklist).
6. Point people to the new address: update the link on the college website and the department page, and set the old Vercel project to redirect (Vercel → Settings → Domains → redirect `cseerp.vercel.app` to the new domain) so bookmarks keep working.
7. Update the Attendance Station laptops ([13](#13-attendance-station-laptops)).

### 6.4 Parallel run (one to two weeks)

- Keep the cloud project **read-only and untouched**, but do not delete it. The GitHub "Keep database awake" workflow (`.github/workflows/keepalive.yml`) and the Vercel cron keep it from pausing; leave them on during this period.
- Every day, the HOD or a class advisor spot-checks a few attendance totals on the new server.
- Make sure nightly backups are arriving off-site.

After sign-off: disable the keepalive workflow, remove the Vercel cron (`vercel.json`) and the Vercel project, delete the migration dump directory (it holds password hashes), and pause, then delete, the Supabase cloud project.

### 6.5 Rollback

Until the cloud project is deleted, going back is quick:

1. Undo the freeze in the cloud (re-grant the revoked privileges / resume the Vercel deployment).
2. Point the website link back to the Vercel address and remove the redirect.
3. Revert the Attendance Station `.env` files.

**Anything entered on the new server after cutover is not in the cloud.** If you roll back after people have used the new server, export those rows first (the `audit_log` table lists every change with its time), or decide with the HOD to re-enter them.

## 7. Post-migration checklist

Tick each item, with the HOD present for the data checks.

- [ ] `deploy/scripts/healthcheck.sh` reports "All checks passed".
- [ ] `https://APP_DOMAIN` shows a valid padlock on a laptop and on a phone (mobile data, not campus Wi-Fi).
- [ ] `https://API_DOMAIN/` shows "Not found" (Studio is not public).
- [ ] `DATABASE_URL=... npm run test:db` passes ([6.2](#62-rehearsal-any-weekday-no-downtime) step 7).
- [ ] **HOD signs in** with the old password and sees the dashboard.
- [ ] A faculty member and a student sign in with their old passwords.
- [ ] Sign-up is impossible: there is no sign-up page, and `curl -X POST https://API_DOMAIN/auth/v1/signup -H "apikey: <anon key>" -H 'Content-Type: application/json' -d '{"email":"x@y.z","password":"Test-12345"}'` returns "Signups not allowed".
- [ ] **Attendance**: for two sections and two subjects, the attendance percentages match the old system. Row counts from `migrate-from-cloud.sh` matched.
- [ ] **Marks** for one subject match.
- [ ] Timetables and the academic calendar look the same.
- [ ] **Files**: open a question paper, a NAAC document and a department document from the Documents page; upload and delete a test file.
- [ ] **HOD actions**: create a test student account, reset its password, delete it (these use the service-role key).
- [ ] **Email**: mark a test student absent (or approve a test leave) and check the email arrives. Check the Resend dashboard for errors.
- [ ] An **Attendance Station** session works end to end ([13](#13-attendance-station-laptops)).
- [ ] First nightly backup exists in `BACKUP_DIR/daily/` and arrived off-site.
- [ ] Cron is installed (`cat /etc/cron.d/licet-erp`) and the weekly alerts call works: `sudo deploy/scripts/run-weekly.sh`.

## 8. Backups and restore tests

`deploy/scripts/backup.sh` runs every night at 01:30 from cron. Each set in `/var/backups/licet-erp/daily/<date>/` has:

| File | Contents |
| --- | --- |
| `db.dump` | the whole database (`pg_dump` custom format), including accounts and password hashes |
| `globals.sql` | database roles |
| `storage.tar.gz` | all uploaded files |
| `config.tar.gz` | `/opt/licet/supabase/.env`, its override and `deploy/.env` (all secrets) |
| `SHA256SUMS`, `info.txt` | checksums; date, git commit, Supabase release |

It keeps 14 daily and 8 weekly sets (Sunday's), then copies everything off-site if `OFFSITE_RSYNC_TARGET` and/or `OFFSITE_RCLONE_REMOTE` are set in `deploy/.env`. **The backups contain personal data and every secret.** Use an encrypted destination (an `rclone crypt` remote, or an encrypted NAS share) and restrict who can read it.

Off-site with rsync to a NAS: create an SSH key for root (`sudo ssh-keygen -t ed25519`), add its public key to the NAS backup user, run `sudo ssh <nas>` once to accept the host key, then set `OFFSITE_RSYNC_TARGET=backup@nas:/volume1/erp-backups`.

**Restore** (replaces the live data; asks you to type RESTORE, saves the current state first):

```bash
sudo deploy/scripts/restore.sh /var/backups/licet-erp/daily/2026-10-16_0130
sudo deploy/scripts/restore.sh <set> --db-only      # database only
sudo deploy/scripts/restore.sh <set> --files-only   # uploaded files only
```

**Monthly restore test (first working day of the month, about 30 minutes).** A backup you have never restored is not a backup.

1. On a spare VM (2 cores / 4 GB is enough), clone the repository, copy `deploy/.env` with `APP_DOMAIN`/`API_DOMAIN` set to test names (or leave Caddy stopped), run `sudo deploy/supabase/setup.sh`.
2. Copy last night's set from the **off-site** copy (this also proves the off-site copy works).
3. `sudo deploy/scripts/restore.sh <set> --yes`
4. Check the row counts it prints against the live server, and open a few files through Studio (SSH tunnel to the VM).
5. Write the date and result in the IT log. Destroy the VM.

**Full server loss** (the old secrets come back, so the Attendance Station laptops keep working):

```bash
# new server prepared as in section 2, repository cloned to /opt/licet/erp,
# latest backup set copied from off-site to /root/restore/<set>
mkdir -p /tmp/cfg && sudo tar -xzf /root/restore/<set>/config.tar.gz -C /tmp/cfg
sudo cp /tmp/cfg/opt/licet/erp/deploy/.env deploy/.env           # adjust if paths differed
sudo deploy/supabase/setup.sh --no-start                          # fetch Supabase, do not start yet
sudo cp /tmp/cfg/opt/licet/supabase/.env /opt/licet/supabase/.env # put the OLD secrets back before the first start
sudo deploy/supabase/setup.sh --reconfigure                       # starts Supabase with the old secrets
sudo deploy/scripts/restore.sh /root/restore/<set> --no-safety-backup
docker compose -f deploy/docker-compose.app.yml up -d --build
sudo rm -rf /tmp/cfg
```

Use the same Supabase release as before (`supabase_ref` in the set's `info.txt`; pass it with `--ref`).

## 9. Upgrades

**ERP (new code from GitHub):**

```bash
cd /opt/licet/erp
deploy/scripts/deploy-app.sh          # git pull --ff-only, rebuild, restart, wait for healthy
```

If the update contains files in `supabase/migrations/`, the script says so. Then:

```bash
sudo deploy/scripts/backup.sh
sudo deploy/scripts/apply-migrations.sh --dry-run
sudo deploy/scripts/apply-migrations.sh
DATABASE_URL=... npm run test:db
```

Rollback: `git checkout <previous commit>` then `deploy/scripts/deploy-app.sh --no-pull` (and restore the pre-migration backup if a migration was the problem).

The repository's site-sync workflow commits department-website updates every two days; on Vercel those deployed automatically. To keep that, enable the commented `deploy-app.sh --if-changed` line in `/etc/cron.d/licet-erp`.

**Supabase** (every few months, or at once for a security release): read the [self-hosted changelog](https://github.com/supabase/supabase/blob/master/docker/CHANGELOG.md), then

```bash
sudo /opt/licet/erp/deploy/scripts/backup.sh
cd /opt/licet/supabase
sh update.sh --dry-run
sh update.sh --to self-hosted/vX.Y.Z
docker compose pull && docker compose up -d
/opt/licet/erp/deploy/scripts/healthcheck.sh
```

**Caddy and Node.js images:** bump the `caddy:` tag in `deploy/docker-compose.app.yml` or `NODE_IMAGE` in `deploy/Dockerfile`, then `deploy/scripts/deploy-app.sh --no-pull`.

**Ubuntu:** security updates install themselves (unattended-upgrades). Reboot in a quiet hour when `/var/run/reboot-required` exists; all containers restart on their own.

## 10. Key rotation

| Secret | When | How |
| --- | --- | --- |
| `SUPABASE_SERVICE_ROLE_KEY` / JWT secret | if leaked, or yearly | Generate new values with `utils/generate-keys.sh` on a scratch copy and put `JWT_SECRET`, `ANON_KEY`, `SERVICE_ROLE_KEY` into `/opt/licet/supabase/.env`; `docker compose up -d` there; `sudo deploy/supabase/setup.sh --reconfigure --no-start` (copies the keys into `deploy/.env`); `deploy/scripts/deploy-app.sh --no-pull` (the anon key is built in). Update the Attendance Station `.env` files. Everyone signs in again. |
| `POSTGRES_PASSWORD` | if leaked | Use the official `utils/db-passwd.sh` in `/opt/licet/supabase`, then `docker compose up -d`. |
| `DASHBOARD_PASSWORD` (Studio) | when an admin leaves | Edit it in `/opt/licet/supabase/.env`, `docker compose up -d`. |
| `CRON_SECRET` | yearly | `openssl rand -hex 32` into `deploy/.env`, `docker compose -f deploy/docker-compose.app.yml up -d`. |
| `RESEND_API_KEY` | if leaked | New key in the Resend dashboard, into `deploy/.env`, restart as above. |
| SSH keys | when an admin leaves | Remove their line from `~/.ssh/authorized_keys`. |

After any rotation, take a fresh backup: older backups still contain the old secrets in `config.tar.gz`.

## 11. Monitoring and disk space

- `deploy/scripts/healthcheck.sh` checks containers, the ERP and API over HTTPS, the database, disk use (warns at 85 %), backup age (over 26 h) and certificate expiry (under 14 days). Cron runs it every 15 minutes and logs problems to `/var/log/licet-erp/health.log`. To get an email, install a mail relay (`sudo apt install msmtp-mta`, configure it with the college SMTP server) and set `MAILTO=it-admin@...` in `/etc/cron.d/licet-erp`.
- An external uptime monitor (for example UptimeRobot's free plan) pointed at `https://APP_DOMAIN/manifest.webmanifest` also catches power and network failures, which the server cannot report itself.
- Logs: `docker logs --tail 200 licet-erp-app`, `docker logs licet-erp-caddy`, `cd /opt/licet/supabase && docker compose logs --tail 200 auth rest storage`.
- Disk: `df -h`, `sudo du -sh /var/backups/licet-erp /opt/licet/supabase/volumes/* /var/lib/docker`. The weekly cron line prunes old Docker images. If backups grow too large, lower `KEEP_DAILY` or move `BACKUP_DIR` to a second disk.
- Database size: `docker exec supabase-db psql -U postgres -c "SELECT pg_size_pretty(pg_database_size('postgres'))"`.

## 12. Security hardening

Already done by this kit:

- Only Caddy publishes ports (80/443). Supabase's gateway (8000) and the Postgres pooler (5432/6543) listen on `127.0.0.1` only (`/opt/licet/supabase/docker-compose.override.yml`). **Never publish Postgres to the internet.**
- The API hostname forwards only `/auth/v1`, `/rest/v1`, `/storage/v1`, `/realtime/v1`, `/functions/v1` and `/graphql/v1`; Studio and the `/pg/` admin API are unreachable from outside.
- `/api/cron/*` on the ERP only answers requests from the server itself, and also needs `CRON_SECRET`.
- Public sign-up is off; accounts come only from the HOD's admin actions. Row Level Security protects every table.
- HTTPS with HSTS, `nosniff`, a strict referrer policy and the ERP's own Content-Security-Policy. The app container runs as a non-root user with no Linux capabilities.
- Secrets live in two mode-600 files, never in git.

You should also:

- **fail2ban** for SSH: `sudo systemctl enable --now fail2ban` (the default `sshd` jail is enough with key-only SSH).
- Keep **unattended-upgrades** on and reboot monthly.
- **Studio only through an SSH tunnel**: `ssh -L 8000:127.0.0.1:8000 admin@server`, then http://localhost:8000 (user and password: `DASHBOARD_USERNAME` / `DASHBOARD_PASSWORD` in `/opt/licet/supabase/.env`). If the college has a VPN, restrict SSH to the VPN range with `ufw`.
- Restrict who has `sudo` and who is in the `docker` group (docker access is root access).
- Do not install other web services on this server.
- If the college firewall or a load balancer sits in front, add its address under `trusted_proxies` in the Caddyfile so client IPs are logged correctly.

## 13. Attendance Station laptops

The Attendance Station (`station/`) runs on staff laptops and talks to the **API hostname**, not to the ERP site. After the cutover, on every laptop edit `station/.env`:

```
SUPABASE_URL=https://erp-api.licet.ac.in
SUPABASE_ANON_KEY=<NEXT_PUBLIC_SUPABASE_ANON_KEY from deploy/.env>
```

Only the **anon** key goes on a laptop, never the service-role key. The laptop needs to reach `https://API_DOMAIN` over its Ethernet or college Wi-Fi (if the server is campus-only, the laptop must be on the campus network). Check-ins queued while offline are sent when it reconnects, as before. Staff sign in to the station console again once, since sessions do not survive the move.

## 14. Troubleshooting

| Symptom | Likely cause / fix |
| --- | --- |
| Browser shows a certificate error | DNS not pointing here yet, or port 80 blocked. `docker logs licet-erp-caddy` shows the ACME error. |
| ERP loads but sign-in fails with a network/CSP error | The image was built with the wrong `NEXT_PUBLIC_SUPABASE_URL`. Fix `deploy/.env`, `deploy/scripts/deploy-app.sh --no-pull`. |
| "Invalid API key" | Anon/service-role key in `deploy/.env` does not match `/opt/licet/supabase/.env`. Run `sudo deploy/supabase/setup.sh --reconfigure --no-start`, then rebuild. |
| Many users get "Too many requests" at 9 a.m. | Supabase Auth rate limits per IP. If campus users share one NAT address, raise `GOTRUE_RATE_LIMIT_*` for the `auth` service in `/opt/licet/supabase/docker-compose.override.yml`. |
| File uploads fail | Disk full, or the file is over 50 MB (bucket limit). |
| Server-side actions (add student) time out | The app container cannot reach the API; `docker exec licet-erp-app wget -qO- https://$API_DOMAIN/auth/v1/health` should answer. Caddy must be running. |
| `apply-migrations.sh` stops on a file | That file was rolled back; read the error, fix the SQL in a new migration, run again. |
| Database container restarting | `cd /opt/licet/supabase && docker compose logs db`; often a full disk. |
