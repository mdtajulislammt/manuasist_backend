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

### 5) Run services in watch mode

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

- API Gateway: `5000`
- Auth Service: `5001`
- Application Service: `5002`
- Admin Service: `5003`
- AI Ingestion Service: `5004`

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

### Lint and test

```bash
pnpm run lint
pnpm run test
pnpm run test:e2e
pnpm run test:cov
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

For a command-focused reference, see `commands.md`.

## License

This repository is currently marked `UNLICENSED` in `package.json`.
