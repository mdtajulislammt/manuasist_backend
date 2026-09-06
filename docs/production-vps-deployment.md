# Menu Assist — Production VPS deployment (A–Z)

This is the production runbook for the **backend monorepo** on a Linux VPS (Ubuntu 22.04/24.04, including Oracle Cloud / generic VPS).

**Recommended topology**

| Layer | How it runs | Why |
|-------|-------------|-----|
| Postgres, Redis, RabbitMQ | Docker Compose | Persistent volumes, easy restart |
| Nest services | Node + **PM2** (`ecosystem.config.cjs`) | Matches this repo; workers live inside the processes |
| Public HTTPS | Nginx + Let’s Encrypt | TLS, WebSocket, upload size limits |
| Admin dashboard | Separate frontend (if used) | Point it at the public API URL |
| Flutter app | Store / TestFlight builds | `ApiEndpoints.baseUrl` must be the production HTTPS origin |

Do **not** expose Postgres, Redis, RabbitMQ, or service ports `4001–4004` to the internet. Only `22`, `80`, and `443` should be public. The API gateway listens on `127.0.0.1:4000` behind Nginx.

Workers (OTP email, contact-change OTP, scan processing, RabbitMQ consumers) start **inside** `menu-auth`, `menu-application`, and `menu-ai`. There is no extra worker process to deploy.

---

## 0. What you need before starting

From Menu Assist / ops:

- [ ] VPS with SSH access (sudo)
- [ ] DNS A record for the API host (example: `api.menuassist.com` → VPS public IP)
- [ ] Production GitHub clone URL and deploy key or PAT
- [ ] SMTP (`SMTP_*` in auth-service `.env`) for OTP mail
- [ ] OpenAI API key (menu analysis + dish images)
- [ ] Google Cloud Vision API key (OCR)
- [ ] RevenueCat project, API key, webhook secret
- [ ] OAuth clients (Google / Apple / Auth0) with production redirect URLs
- [ ] Optional: AWS S3 bucket if not storing files on disk
- [ ] Optional: Firebase service account for push notifications
- [ ] Production admin dashboard origin(s) for CORS

Replace these placeholders everywhere below:

| Placeholder | Meaning |
|-------------|---------|
| `YOUR_DOMAIN` | Public API host, e.g. `api.menuassist.com` |
| `/var/www/menu-assist-backend` | App directory on the VPS |
| `DEPLOY_USER` | Linux user that owns the app (not root for Node) |

---

## 1. Server baseline

SSH in as a sudo user.

```bash
sudo apt update && sudo apt upgrade -y
sudo apt install -y curl git ufw fail2ban unzip ca-certificates gnupg lsb-release build-essential
```

Create a deploy user (if you do not already have one):

```bash
sudo adduser --disabled-password --gecos "" deploy
sudo usermod -aG sudo deploy
sudo mkdir -p /home/deploy/.ssh
sudo cp ~/.ssh/authorized_keys /home/deploy/.ssh/
sudo chown -R deploy:deploy /home/deploy/.ssh
sudo chmod 700 /home/deploy/.ssh
sudo chmod 600 /home/deploy/.ssh/authorized_keys
```

### Firewall

```bash
sudo ufw default deny incoming
sudo ufw default allow outgoing
sudo ufw allow OpenSSH
sudo ufw allow 80/tcp
sudo ufw allow 443/tcp
sudo ufw enable
sudo ufw status
```

Do **not** open `5433`, `5672`, `15672`, `6380`, or `4000–4004`.

---

## 2. Install runtime

### Docker Engine + Compose plugin

```bash
curl -fsSL https://get.docker.com | sudo sh
sudo usermod -aG docker $USER
# log out and back in so the docker group applies
docker --version
docker compose version
```

### Node.js 22 + pnpm 10

```bash
curl -fsSL https://deb.nodesource.com/setup_22.x | sudo -E bash -
sudo apt install -y nodejs
sudo corepack enable
sudo corepack prepare pnpm@10.33.0 --activate
node -v
pnpm -v
```

### Nginx, Certbot, PM2

```bash
sudo apt install -y nginx certbot python3-certbot-nginx
sudo npm install -g pm2
```

---

## 3. Clone the repository

```bash
sudo mkdir -p /var/www
sudo chown "$USER":"$USER" /var/www
cd /var/www
git clone git@github.com:YOUR_ORG/menu-assist-backend.git menu-assist-backend
cd /var/www/menu-assist-backend
git checkout main
```

Use the Menu Assist GitHub org remote, not a personal laptop copy.

---

## 4. Start infrastructure (Postgres, Redis, RabbitMQ)

Bind published ports to localhost so they are not reachable from the public IP.

Edit `docker-compose.yml` on the VPS (or keep a `docker-compose.prod.yml` overlay) so host bindings look like:

```yaml
ports:
  - '127.0.0.1:5433:5432'   # postgres
  - '127.0.0.1:5672:5672'   # rabbitmq amqp
  - '127.0.0.1:15672:15672' # rabbitmq UI — prefer leaving this unpublished in prod
  - '127.0.0.1:6380:6379'   # redis
```

**Change default passwords** before the first `up` (Compose only applies `POSTGRES_PASSWORD` / `RABBITMQ_DEFAULT_*` on an empty volume):

```yaml
POSTGRES_USER: postgres
POSTGRES_PASSWORD: 'REPLACE_WITH_LONG_PASSWORD'
RABBITMQ_DEFAULT_USER: menuassist
RABBITMQ_DEFAULT_PASS: 'REPLACE_WITH_LONG_PASSWORD'
```

For Redis, prefer a password:

```yaml
command: redis-server --appendonly yes --requirepass REPLACE_WITH_LONG_PASSWORD
```

Start infra only (not the Nest Docker images — those are for local full-stack compose, not this PM2 layout):

```bash
cd /var/www/menu-assist-backend
docker compose up -d postgres rabbitmq redis
docker compose ps
docker compose logs postgres --tail 30
```

Wait until Postgres is healthy, then confirm the four databases exist (created by `docker/postgres/init/01-create-service-databases.sql` on first empty volume):

```bash
docker compose exec postgres psql -U postgres -c '\l'
```

You must see:

- `menu_assist_auth_service`
- `menu_assist_admin_service`
- `menu_assist_application_service`
- `menu_assist_ai_ingestion_service`

If they are missing, the volume was already initialized without the init script. Create them manually:

```bash
docker compose exec postgres psql -U postgres -c "CREATE DATABASE menu_assist_auth_service;"
docker compose exec postgres psql -U postgres -c "CREATE DATABASE menu_assist_admin_service;"
docker compose exec postgres psql -U postgres -c "CREATE DATABASE menu_assist_application_service;"
docker compose exec postgres psql -U postgres -c "CREATE DATABASE menu_assist_ai_ingestion_service;"
```

Login test from the host:

```bash
sudo apt install -y postgresql-client
PGPASSWORD='REPLACE_WITH_LONG_PASSWORD' psql -h 127.0.0.1 -p 5433 -U postgres -d postgres -c 'SELECT 1'
```

---

## 5. Generate secrets

Run these on the VPS and store the output in a password manager. Do **not** commit them.

```bash
# Internal service keys (use a unique value per key)
openssl rand -hex 32

# JWT RS256 key pair
openssl genpkey -algorithm RSA -pkeyopt rsa_keygen_bits:2048 -out /tmp/jwt-private.pem
openssl pkey -in /tmp/jwt-private.pem -pubout -out /tmp/jwt-public.pem
```

Convert PEMs to single-line `\n` strings for `.env`:

```bash
awk 'NF {sub(/\r/, ""); printf "%s\\n",$0;}' /tmp/jwt-private.pem
awk 'NF {sub(/\r/, ""); printf "%s\\n",$0;}' /tmp/jwt-public.pem
```

Then delete the temp files:

```bash
shred -u /tmp/jwt-private.pem /tmp/jwt-public.pem
```

---

## 6. Environment files

From the repo root:

```bash
cp .env.example .env
cp apps/api-gateway/.env.example apps/api-gateway/.env
cp apps/auth-service/.env.example apps/auth-service/.env
cp apps/application-service/.env.example apps/application-service/.env
cp apps/admin-service/.env.example apps/admin-service/.env
cp apps/ai-ingestion-service/.env.example apps/ai-ingestion-service/.env
chmod 600 .env apps/*/.env
```

Each Nest app loads **root `.env` first**, then **`apps/<service>/.env`** (override). Keep shared URLs in root `.env` and service-specific secrets in the service file. Values below are the production pattern for a **PM2 + localhost** layout.

### 6.1 Root `.env`

```env
NODE_ENV=production
RABBITMQ_URL=amqp://menuassist:REPLACE_WITH_LONG_PASSWORD@127.0.0.1:5672
REDIS_URL=redis://:REPLACE_WITH_LONG_PASSWORD@127.0.0.1:6380

API_GATEWAY_PORT=4000
AUTH_SERVICE_PORT=4001
APPLICATION_SERVICE_PORT=4002
ADMIN_SERVICE_PORT=4003
AI_INGESTION_SERVICE_PORT=4004

AUTH_SERVICE_URL=http://127.0.0.1:4001
APPLICATION_SERVICE_URL=http://127.0.0.1:4002
ADMIN_SERVICE_URL=http://127.0.0.1:4003
AI_INGESTION_SERVICE_URL=http://127.0.0.1:4004

AUTH_INTERNAL_API_KEY=REPLACE
APPLICATION_INTERNAL_API_KEY=REPLACE
ADMIN_INTERNAL_API_KEY=REPLACE
INGESTION_INTERNAL_API_KEY=REPLACE

AUTH_DATABASE_URL=postgresql://postgres:REPLACE_WITH_LONG_PASSWORD@127.0.0.1:5433/menu_assist_auth_service
APPLICATION_DATABASE_URL=postgresql://postgres:REPLACE_WITH_LONG_PASSWORD@127.0.0.1:5433/menu_assist_application_service
ADMIN_DATABASE_URL=postgresql://postgres:REPLACE_WITH_LONG_PASSWORD@127.0.0.1:5433/menu_assist_admin_service
AI_INGESTION_DATABASE_URL=postgresql://postgres:REPLACE_WITH_LONG_PASSWORD@127.0.0.1:5433/menu_assist_ai_ingestion_service

FILE_STORAGE_LOCAL_ROOT=uploads
APPLICATION_PUBLIC_URL=https://YOUR_DOMAIN/v1/app
FILE_STORAGE_PUBLIC_URL=https://YOUR_DOMAIN/v1/admin
```

URL-encode special characters in passwords (`@`, `#`, `/`, `:`) inside connection strings.

### 6.2 `apps/api-gateway/.env`

```env
API_GATEWAY_PORT=4000
AUTH_SERVICE_URL=http://127.0.0.1:4001
APPLICATION_SERVICE_URL=http://127.0.0.1:4002
ADMIN_SERVICE_URL=http://127.0.0.1:4003
AI_INGESTION_SERVICE_URL=http://127.0.0.1:4004
CORS_ORIGIN=https://admin.YOUR_DOMAIN,https://YOUR_DASHBOARD_ORIGIN
```

Mobile apps send no `Origin`; they are allowed. Browser dashboards **must** be listed in `CORS_ORIGIN` (comma-separated, no trailing slash).

### 6.3 `apps/auth-service/.env`

Must-set:

| Variable | Production value |
|----------|------------------|
| `AUTH_DATABASE_URL` | Same as root |
| `RABBITMQ_URL` / `REDIS_URL` | Same as root |
| `JWT_PRIVATE_KEY` / `JWT_PUBLIC_KEY` | Generated PEMs |
| `JWT_ISSUER` | `http://127.0.0.1:4001` (must match other services) |
| `JWT_AUDIENCE` | `menu-assist-api` |
| `AUTH_INTERNAL_API_KEY` | Same as other services |
| `APPLICATION_SERVICE_URL` | `http://127.0.0.1:4002` |
| `APPLICATION_INTERNAL_API_KEY` | Same as application-service |
| `OIDC_REDIRECT_URI` | `https://YOUR_DOMAIN/v1/auth/oauth/callback` |
| `SMTP_HOST` / `SMTP_PORT` / `SMTP_SECURE` / `SMTP_USER` / `SMTP_PASSWORD` / `SMTP_FROM` | Office 365 SMTP (`smtp.office365.com:587`) |
| `GOOGLE_CLIENT_ID` / `APPLE_CLIENT_ID` | Production mobile client IDs |

Do **not** use the example seed passwords in production. Either omit `AUTH_SEED_*` or set unique values and rotate immediately after first login.

`JWT_ISSUER` is the token issuer claim, **not** the public HTTPS URL. Keep it aligned with `AUTH_JWT_ISSUER` on every other service.

### 6.4 `apps/application-service/.env`

| Variable | Production value |
|----------|------------------|
| `AUTH_JWKS_URI` | `http://127.0.0.1:4001/.well-known/jwks.json` |
| `AUTH_JWT_ISSUER` | `http://127.0.0.1:4001` |
| `AUTH_JWT_AUDIENCE` | `menu-assist-api` |
| `ADMIN_SERVICE_URL` | `http://127.0.0.1:4003` |
| `AI_INGESTION_SERVICE_URL` | `http://127.0.0.1:4004` |
| Internal API keys | Must match the owning service |
| `REVENUECAT_WEBHOOK_SECRET` | Same Bearer secret as RevenueCat dashboard |
| `REFERRAL_SHARE_BASE_URL` | Public marketing / app URL |
| `FIREBASE_*` | Optional, for push |

### 6.5 `apps/admin-service/.env`

| Variable | Production value |
|----------|------------------|
| `AUTH_JWKS_URI` / `AUTH_JWT_ISSUER` / `AUTH_JWT_AUDIENCE` | Same as application-service |
| `FILE_STORAGE_PUBLIC_URL` | `https://YOUR_DOMAIN/v1/admin` |
| `FILE_STORAGE_LOCAL_ROOT` | `uploads` (relative to PM2 cwd = repo root) |
| `REVENUECAT_API_KEY` / `REVENUECAT_PROJECT_ID` | Secret API key, not the public SDK key |
| S3 vars | Only if using S3 instead of local disk |

### 6.6 `apps/ai-ingestion-service/.env`

| Variable | Production value |
|----------|------------------|
| `API_GATEWAY_PUBLIC_URL` | `https://YOUR_DOMAIN` |
| `FILE_STORAGE_PUBLIC_URL` | `https://YOUR_DOMAIN/v1/admin` |
| `OPENAI_API_KEY` | Required for classification + dish images |
| `GOOGLE_VISION_API_KEY` | Required for real OCR |
| `OCR_PROVIDER` | `google` |
| `SCAN_DISH_CONCURRENCY` | `4` is a safe default |

Copy the **same** internal API keys into every service that calls that peer. A mismatch shows up as `401` on `/internal/*`.

---

## 7. Install, migrate, build

Always run from the repo root.

```bash
cd /var/www/menu-assist-backend
pnpm install --frozen-lockfile
pnpm run prisma:generate:all
pnpm run prisma:migrate:auth
pnpm run prisma:migrate:admin
pnpm run prisma:migrate:application
pnpm run prisma:migrate:ai
pnpm run build
```

Optional first-time seeds (dev-like accounts — skip on a real production database unless you intend to):

```bash
pnpm run seed:all
pnpm run backfill:stored-files
```

Create the uploads directory and keep it writable by the PM2 user:

```bash
mkdir -p uploads
```

Confirm dist entrypoints exist (these are what PM2 starts):

```text
dist/apps/auth-service/apps/auth-service/src/main.js
dist/apps/admin-service/apps/admin-service/src/main.js
dist/apps/application-service/apps/application-service/src/main.js
dist/apps/ai-ingestion-service/apps/ai-ingestion-service/src/main.js
dist/apps/api-gateway/apps/api-gateway/src/main.js
```

---

## 8. Start Nest with PM2

```bash
cd /var/www/menu-assist-backend
pm2 start ecosystem.config.cjs
pm2 save
pm2 startup systemd
# run the command that `pm2 startup` prints, then:
pm2 save
pm2 status
pm2 logs --lines 80
```

Process names:

| PM2 name | Service | Port |
|----------|---------|------|
| `menu-auth` | auth-service | 4001 |
| `menu-admin` | admin-service | 4003 |
| `menu-application` | application-service | 4002 |
| `menu-ai` | ai-ingestion-service | 4004 |
| `menu-gateway` | api-gateway | 4000 |

Start order in `ecosystem.config.cjs` already brings auth/admin/app/ai up before the gateway.

Local health (before Nginx):

```bash
curl -sS http://127.0.0.1:4000/health
curl -sS http://127.0.0.1:4000/v1/auth/health
curl -sS http://127.0.0.1:4000/v1/app/health
curl -sS http://127.0.0.1:4000/v1/admin/health
curl -sS http://127.0.0.1:4000/v1/ingestion/health
```

Each should return `{ "status": "ok", "service": "..." }`.

If an upstream is down, the gateway stays up and returns **HTTP 502** JSON for that mount.

---

## 9. Nginx reverse proxy + TLS

Create `/etc/nginx/sites-available/menu-assist-api`:

```nginx
map $http_upgrade $connection_upgrade {
    default upgrade;
    ''      close;
}

server {
    listen 80;
    listen [::]:80;
    server_name YOUR_DOMAIN;

    location /.well-known/acme-challenge/ {
        root /var/www/letsencrypt;
    }

    location / {
        return 301 https://$host$request_uri;
    }
}

server {
    listen 443 ssl http2;
    listen [::]:443 ssl http2;
    server_name YOUR_DOMAIN;

    # certbot will fill these in; placeholders until first cert
    ssl_certificate     /etc/letsencrypt/live/YOUR_DOMAIN/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/YOUR_DOMAIN/privkey.pem;
    include             /etc/letsencrypt/options-ssl-nginx.conf;
    ssl_dhparam         /etc/letsencrypt/ssl-dhparams.pem;

    client_max_body_size 25m;
    proxy_read_timeout 120s;
    proxy_send_timeout 120s;

    location /socket.io/ {
        proxy_pass http://127.0.0.1:4000;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection $connection_upgrade;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_cache_bypass $http_upgrade;
        proxy_read_timeout 86400s;
    }

    location / {
        proxy_pass http://127.0.0.1:4000;
        proxy_http_version 1.1;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_set_header X-Request-Id $request_id;
    }
}
```

Issue the certificate (HTTP-only first if cert files do not exist yet):

```bash
sudo mkdir -p /var/www/letsencrypt
sudo ln -s /etc/nginx/sites-available/menu-assist-api /etc/nginx/sites-enabled/
sudo nginx -t
sudo systemctl reload nginx

sudo certbot --nginx -d YOUR_DOMAIN
sudo systemctl reload nginx
```

Confirm HTTPS:

```bash
curl -sS https://YOUR_DOMAIN/health
curl -sS https://YOUR_DOMAIN/v1/auth/health
```

Public gateway mounts:

| Public path | Upstream |
|-------------|----------|
| `/v1/auth/*` | auth-service |
| `/v1/app/*` | application-service |
| `/v1/admin/*` | admin-service |
| `/v1/ingestion/*` | ai-ingestion-service |
| `/socket.io/*` | application-service via gateway |
| `/health` | api-gateway |

If Cloudflare sits in front, set SSL mode to **Full (strict)** and allow WebSockets. Bot Fight / “I'm Under Attack” will break Flutter image and API calls unless the API hostname is skipped.

---

## 10. File storage

Default is **local disk** under `uploads/` at the repo root (`FILE_STORAGE_LOCAL_ROOT`). Public URLs are built from `FILE_STORAGE_PUBLIC_URL` (gateway `/v1/admin`).

Keep this directory on a persistent disk. If the VPS is rebuilt, copy `uploads/` back before starting `menu-admin`.

To use S3 instead:

1. Set `AWS_REGION`, `AWS_S3_BUCKET`, credentials or instance IAM role.
2. After services are up, switch the admin storage setting to `S3` via `PATCH /v1/admin/storage/settings`.
3. Existing local files are **not** migrated automatically.

---

## 11. Third-party production wiring

### OTP email

Auth-service sends signup / reset / contact-change mail through SMTP (`SMTP_HOST`, `SMTP_USER`, `SMTP_PASSWORD`). For Office 365 use `smtp.office365.com:587` with `SMTP_SECURE=false`. `SMTP_FROM` should match the authenticated mailbox (e.g. `notify@menuassistapp.com`). Confirm a real OTP arrives after deploy.

### RevenueCat webhook

Dashboard URL:

```text
https://YOUR_DOMAIN/v1/app/internal/revenuecat/webhook
```

Authorization header: `Bearer <REVENUECAT_WEBHOOK_SECRET>`

Full event list: [`docs/revenuecat-webhook-setup.md`](revenuecat-webhook-setup.md).

### OAuth

IdP callback must be:

```text
https://YOUR_DOMAIN/v1/auth/oauth/callback
```

### Flutter

Set the app base URL to `https://YOUR_DOMAIN` (no trailing slash). Production builds must not point at localhost or a developer staging host.

### Admin dashboard

Use `https://YOUR_DOMAIN` as the API origin and add the dashboard origin to `CORS_ORIGIN`. Redeploy/restart `menu-gateway` after CORS changes.

---

## 12. Logging and restart policy

```bash
pm2 logs                # all services
pm2 logs menu-gateway
pm2 monit
```

Install log rotation:

```bash
pm2 install pm2-logrotate
pm2 set pm2-logrotate:max_size 20M
pm2 set pm2-logrotate:retain 14
```

Docker infra already uses `restart: unless-stopped`. PM2 + `pm2 startup` brings Node back after reboot.

Reboot test:

```bash
sudo reboot
# after login
docker compose -f /var/www/menu-assist-backend/docker-compose.yml ps
pm2 status
curl -sS https://YOUR_DOMAIN/health
```

---

## 13. Backups

Run daily from cron as the deploy user. Store copies **off the VPS**.

```bash
sudo mkdir -p /var/backups/menu-assist
sudo chown "$USER":"$USER" /var/backups/menu-assist
```

Example script `/usr/local/bin/menu-assist-backup.sh`:

```bash
#!/usr/bin/env bash
set -euo pipefail
STAMP=$(date -u +%Y%m%dT%H%M%SZ)
ROOT=/var/www/menu-assist-backend
OUT=/var/backups/menu-assist
cd "$ROOT"

docker compose exec -T postgres pg_dumpall -U postgres | gzip > "$OUT/pg-$STAMP.sql.gz"
tar -C "$ROOT" -czf "$OUT/uploads-$STAMP.tar.gz" uploads
# keep last 14 days
find "$OUT" -type f -mtime +14 -delete
```

```bash
sudo chmod +x /usr/local/bin/menu-assist-backup.sh
crontab -e
# 03:15 UTC daily
15 3 * * * /usr/local/bin/menu-assist-backup.sh
```

Also back up `.env` files securely (not in git). Redis AOF and RabbitMQ volumes live in Docker named volumes; database dumps are the recovery source of truth.

---

## 14. Update (zero-ish downtime)

```bash
cd /var/www/menu-assist-backend
git fetch origin
git checkout main
git pull origin main
pnpm install --frozen-lockfile
pnpm run prisma:generate:all
pnpm run prisma:migrate:auth
pnpm run prisma:migrate:admin
pnpm run prisma:migrate:application
pnpm run prisma:migrate:ai
pnpm run build
pm2 reload ecosystem.config.cjs
pm2 status
curl -sS https://YOUR_DOMAIN/health
```

`pm2 reload` restarts processes in-place. Migrations run **before** reload so new code matches the schema.

---

## 15. Rollback

1. Note the previous git SHA (`git log -1 --oneline` before pull, or `git reflog`).
2. Restore DB only if a migration is incompatible:

   ```bash
   gunzip -c /var/backups/menu-assist/pg-TIMESTAMP.sql.gz | docker compose exec -T postgres psql -U postgres
   ```

3. Check out the last known-good commit, rebuild, reload:

   ```bash
   git checkout <GOOD_SHA>
   pnpm install --frozen-lockfile
   pnpm run build
   pm2 reload ecosystem.config.cjs
   ```

Prisma `migrate deploy` does not auto-rollback SQL. Prefer forward-fix migrations when possible; restore the dump only if the new migration cannot be reversed.

---

## 16. Post-deploy checklist

- [ ] `https://YOUR_DOMAIN/health` → api-gateway ok
- [ ] `/v1/auth/health`, `/v1/app/health`, `/v1/admin/health`, `/v1/ingestion/health` ok
- [ ] Signup OTP email arrives
- [ ] Login + JWT works from Flutter
- [ ] Socket.IO connects (`wss://YOUR_DOMAIN/socket.io`)
- [ ] Menu scan upload (multipart) succeeds
- [ ] Launch content `GET /v1/admin/branding/launch-content/active` is public (no 401)
- [ ] Splash / intro images load over HTTPS
- [ ] Referral live update still works with the socket
- [ ] RevenueCat test webhook accepted
- [ ] Admin dashboard can log in (CORS)
- [ ] Reboot: Docker + PM2 come back without SSH
- [ ] Backup cron produced a dump
- [ ] Production Flutter build uses only `https://YOUR_DOMAIN`

---

## 17. Troubleshooting

| Symptom | Check |
|---------|-------|
| Gateway 502 | `pm2 status`; `curl` each `127.0.0.1:4001–4004/health` |
| Prisma P1000 | DB URL password ≠ Docker `POSTGRES_PASSWORD` (password is frozen at first volume create) |
| Prisma P1001 | Postgres not listening on `127.0.0.1:5433`; `docker compose ps postgres` |
| Missing `menu_assist_*` databases | Init script only runs on empty volume; create DBs manually |
| JWT 401 on all APIs | `JWT_ISSUER` ≠ `AUTH_JWT_ISSUER`, or JWKS unreachable |
| Internal 401 | Mismatched `*_INTERNAL_API_KEY` |
| OTP never arrives | `SMTP_*` (host/user/password/from), Redis up (`REDIS_URL` port **6380** with Compose), `pm2 logs menu-auth` |
| Scan stuck | `pm2 logs menu-ai`; OpenAI / Vision keys; RabbitMQ healthy |
| Images 401 on splash | Public launch-content routes; Cloudflare bot challenge |
| Multipart “Unexpected end of form” | Nginx `client_max_body_size`; request went through gateway (not a stripped proxy) |
| Socket.IO fails | Nginx `/socket.io/` upgrade headers; gateway `APPLICATION_SERVICE_URL` |
| CORS error in dashboard | Missing origin in `CORS_ORIGIN`; restart `menu-gateway` |
| PM2 died after reboot | `pm2 startup` systemd unit not installed / `pm2 save` not run |

Postgres password mismatch notes: [`pm2.md`](../pm2.md).

---

## 18. What this layout does **not** cover

- Deploying the **admin dashboard frontend** (separate repo). Point it at `https://YOUR_DOMAIN` and add its origin to CORS.
- App Store / Play signing and store listings.
- Separating staging vs production on two VMs — copy this runbook onto a second host with different secrets, domain, and databases. Never reuse production keys on staging.

---

## 19. Credentials inventory (fill in for handoff)

Keep this table in a private ops doc, not in git.

| Secret | Purpose | Where it lives | Owner |
|--------|---------|----------------|-------|
| SSH / deploy key | VPS + GitHub | | |
| Postgres password | Four service DBs | `.env`, Compose | |
| Redis / RabbitMQ | Queues + OTP | `.env`, Compose | |
| JWT RS256 keys | Access tokens | `apps/auth-service/.env` | |
| Internal API keys | Service-to-service | all service `.env` | |
| SMTP mailbox password | OTP mail | auth `.env` | |
| OpenAI | Scan + dish images | ai-ingestion `.env` | |
| Google Vision | OCR | ai-ingestion `.env` | |
| RevenueCat | Subscriptions | application + admin `.env` | |
| OIDC / Google / Apple | Social login | auth `.env` | |
| AWS / Firebase | Optional storage / push | admin / application `.env` | |
| Let’s Encrypt | TLS | `/etc/letsencrypt` | |
