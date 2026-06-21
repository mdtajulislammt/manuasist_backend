# Development commands

## First-time setup

```bash
pnpm install
pnpm run prisma:generate:all
```

Copy env files (adjust as needed):

```bash
cp .env.example .env
cp apps/api-gateway/.env.example apps/api-gateway/.env
cp apps/application-service/.env.example apps/application-service/.env
cp apps/auth-service/.env.example apps/auth-service/.env
cp apps/admin-service/.env.example apps/admin-service/.env
cp apps/ai-ingestion-service/.env.example apps/ai-ingestion-service/.env
```

Ensure `DATABASE_URL` / `*_DATABASE_URL` values in those `.env` files match Postgres (see [docker/postgres/init/01-create-service-databases.sql](docker/postgres/init/01-create-service-databases.sql)).

**application-service** also needs Redis (see Docker section below):

```env
REDIS_URL=redis://127.0.0.1:6379
CONTACT_CHANGE_OTP_RESEND_COOLDOWN_SECONDS=60
```

## Database and messaging (Docker)

All local infra runs in the Compose project **`menuassistai-powereddietaryintelligenceapp`** (same group as before). Named volumes keep Postgres, RabbitMQ, and Redis data across restarts:

- `menuassistai-powereddietaryintelligenceapp_postgres_data`
- `menuassistai-powereddietaryintelligenceapp_rabbitmq_data`
- `menuassistai-powereddietaryintelligenceapp_redis_data`

Start **Postgres**, **RabbitMQ**, and **Redis** together (typical for local Nest development):

```bash
docker compose up -d postgres rabbitmq redis
```

- Postgres: `localhost:5433` (user/password `postgres` / `postgres`).
- RabbitMQ AMQP: `5672`; management UI: [http://localhost:15672](http://localhost:15672) (`guest` / `guest`).
- Redis: `localhost:6379` (required by **application-service** for BullMQ profile OTP).

Stop containers (volumes are kept):

```bash
docker compose down
```

Do **not** use `-v` unless you intentionally want to wipe all local DB, queue, and Redis data:

```bash
docker compose down -v
```

Full stack (all services built from Dockerfiles):

```bash
docker compose up --build
```

## Sync all Postgres databases

After Postgres is up, apply every service schema from the repo root:

```bash
pnpm run prisma:generate:all
pnpm run prisma:migrate:auth
pnpm run prisma:migrate:application
pnpm run prisma:migrate:admin
pnpm run prisma:migrate:ai
```

Optional dev seed:

```bash
pnpm run seed:all
```

## Run Nest services locally (watch mode)

From the repo root:

```bash
pnpm run start:dev:gateway
pnpm run start:dev:application
pnpm run start:dev:auth
pnpm run start:dev:admin
pnpm run start:dev:ai
```

Run the gateway without watch:

```bash
pnpm start
```

Debug gateway with inspector:

```bash
pnpm run start:debug
```

## Build and production-style run

```bash
pnpm run build
node dist/apps/api-gateway/main.js
```

(or `pnpm run start:prod` for the gateway entrypoint).

## Prisma (per service)

Regenerate clients after schema changes:

```bash
pnpm run prisma:generate:application
pnpm run prisma:generate:auth
pnpm run prisma:generate:admin
pnpm run prisma:generate:ai
```

Apply migrations from a service directory when you add them (example):

```bash
cd apps/application-service && pnpm exec prisma migrate dev
```

