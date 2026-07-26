# Menu Assist - AI-Powered Dietary Intelligence App

Backend monorepo for Menu Assist, built with NestJS and pnpm workspaces.  
The platform uses a gateway + domain services architecture with separate databases per service.

## Architecture

- `api-gateway` - public API entrypoint and upstream proxy
- `auth-service` - authentication, JWT/JWKS integration, roles/permissions
- `application-service` - core application domain APIs
- `admin-service` - admin workflows (including onboarding flows/icons management)
- `ai-ingestion-service` - AI-related ingestion/pipeline endpoints
- shared libraries in `libs/` (auth utilities, contracts, messaging, AI pipeline)

## Tech Stack

- Node.js + TypeScript
- NestJS 11
- pnpm workspaces
- PostgreSQL (one DB per service)
- RabbitMQ
- Prisma ORM
- Swagger/OpenAPI in services that expose docs

## Prerequisites

- Node.js 20+ recommended
- pnpm 10+
- Docker Desktop (for local Postgres/RabbitMQ)

## Quick Start

### 1) Install dependencies

```bash
pnpm install
```

### 2) Configure environment

Copy root and service env files from examples and update values as needed:

```bash
cp .env.example .env
cp apps/api-gateway/.env.example apps/api-gateway/.env
cp apps/application-service/.env.example apps/application-service/.env
cp apps/auth-service/.env.example apps/auth-service/.env
cp apps/admin-service/.env.example apps/admin-service/.env
cp apps/ai-ingestion-service/.env.example apps/ai-ingestion-service/.env
```

### 3) Start infrastructure (local dev)

```bash
docker compose up -d postgres rabbitmq
```

Default local ports:
- Postgres: `localhost:5433`
- RabbitMQ AMQP: `localhost:5672`
- RabbitMQ UI: [http://localhost:15672](http://localhost:15672)

### 4) Generate Prisma clients and run migrations

```bash
pnpm run prisma:generate:all
pnpm run prisma:migrate:auth
pnpm run prisma:migrate:admin
pnpm run prisma:migrate:application
pnpm run prisma:migrate:ai
```

### 5) Seed local accounts (optional)

```bash
pnpm run seed:all
```

| Account | Email | Password | Notes |
|---------|-------|----------|-------|
| Admin | `admin@menuassist.local` | `Admin@123456` | roles: user + admin |
| User | `user@menuassist.local` | `User@123456` | free tier |
| Premium | `premium@menuassist.local` | `Premium@123456` | ACTIVE 1-month `premium` entitlement |

Override with `AUTH_SEED_*` env vars in `apps/auth-service/.env`. Entitlement only: `pnpm run seed:application` (requires auth seed first).

### 6) Run services in watch mode

Start each service in its own terminal:

```bash
pnpm run start:dev:gateway
pnpm run start:dev:application
pnpm run start:dev:auth
pnpm run start:dev:admin
pnpm run start:dev:ai
```

## Service Ports (default)

From `.env.example`:

- API Gateway: `2645`
- Auth Service: `2646`
- Application Service: `2647`
- Admin Service: `2648`
- AI Ingestion Service: `2649`

## Common Commands

### Build

```bash
pnpm run build
```

Or per service:

```bash
pnpm run build:gateway
pnpm run build:application
pnpm run build:auth
pnpm run build:admin
pnpm run build:ai
```

### Start (non-watch)

```bash
pnpm run start:gateway
pnpm run start:application
pnpm run start:auth
pnpm run start:admin
pnpm run start:ai
```

### Production-style gateway run

```bash
pnpm run start:prod
```

If an upstream (auth/app/admin/ai) is down, the gateway returns **HTTP 502** JSON (`{ success: false, message, status: 502 }`) and **keeps running**. It should not exit the process.

Quick check (gateway up, auth stopped):

```bash
curl -i http://localhost:5000/v1/auth/health
# expect 502; gateway process still alive
```

### Lint and test

```bash
pnpm run lint
pnpm run test
pnpm run test:e2e
pnpm run test:cov
pnpm run test:phase2
```

## Phase 2 — AI ingestion (menu scan)

Mobile app uploads a menu photo; the backend stores it, runs OCR, classifies dishes with user preferences, and returns NAI scores plus recommendations.

| Method | Gateway path | Description |
|--------|----------------|-------------|
| POST | `/v1/ingestion/scans` | Multipart `file` (JPEG/PNG/WebP) — primary app flow |
| POST | `/v1/ingestion/scans/text` | JSON `{ "menuText" }` — dev/test only |
| GET | `/v1/ingestion/scans` | List scans with dishes |
| GET | `/v1/ingestion/scans/:id` | Single scan |
| GET | `/v1/ingestion/scans/:id/recommendations` | Ranked recommendations + NAI |
| GET | `/v1/ingestion/recommendations/me` | Cross-scan top picks |
| GET | `/v1/ingestion/patterns/me` | Diet pattern aggregates |

Configure `apps/ai-ingestion-service/.env` (see `.env.example`): `OPENAI_API_KEY`, `GOOGLE_VISION_API_KEY` (or OCR falls back to demo text), `APPLICATION_INTERNAL_API_KEY`, `ADMIN_INTERNAL_API_KEY`.

After schema changes:

```bash
pnpm run prisma:migrate:ai
pnpm run prisma:generate:ai
```

## Docker

Run only infrastructure:

```bash
docker compose up -d postgres rabbitmq
```

Run full stack from Dockerfiles:

```bash
docker compose up --build
```

Stop containers:

```bash
docker compose down
```

## Platform file storage (local vs S3)

Admins can set the **default storage provider for new uploads** via the admin API:

- `GET /storage/settings` — current default (`LOCAL` or `S3`) and capability flags
- `PATCH /storage/settings` — body `{ "activeProvider": "LOCAL" | "S3" }`

Each stored file keeps the provider it was created with when you toggle (no automatic migration).

**Local (VPS):** files under `FILE_STORAGE_LOCAL_ROOT` (default `uploads/`), gitignored.

**S3:** set `AWS_REGION`, `AWS_S3_BUCKET`, and credentials (or use an IAM role on the host).

After migrating the admin DB, backfill legacy onboarding icons into the registry:

```bash
pnpm run prisma:migrate:admin
pnpm run backfill:stored-files
```

**Internal upload (other services):** `POST /internal/files` with header `x-internal-api-key` and multipart `file` + `namespace`.

## RevenueCat webhooks (subscriptions)

Flutter purchases sync to `application-service` via:

`POST /v1/app/internal/revenuecat/webhook` with `Authorization: Bearer <REVENUECAT_WEBHOOK_SECRET>`

Full dashboard setup, ngrok local testing, and verification steps:
[`docs/revenuecat-webhook-setup.md`](docs/revenuecat-webhook-setup.md)

Quick local smoke test (gateway on port 2645):

```powershell
.\scripts\test-revenuecat-webhook.ps1 -UserId "<auth-user-uuid>"
```

For a command-focused reference, see `commands.md`.

## License

This repository is currently marked `UNLICENSED` in `package.json`.
