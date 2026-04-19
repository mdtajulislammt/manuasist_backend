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

After Postgres is up, apply the **auth-service** schema (creates `auth_roles` and related tables):

```bash
pnpm run prisma:migrate:auth
```

This runs `prisma migrate deploy` in `apps/auth-service` using `AUTH_DATABASE_URL` from `apps/auth-service/.env` (loaded automatically by Prisma from that folder).

## Database and messaging (Docker)

Start **Postgres** and **RabbitMQ** only (typical for local Nest development):

```bash
docker compose up -d postgres rabbitmq
```

- Postgres: `localhost:5433` (host port mapped to container 5432; user/password `postgres` / `postgres` per [docker-compose.yml](docker-compose.yml)).
- RabbitMQ AMQP: `5672`; management UI: [http://localhost:15672](http://localhost:15672) (`guest` / `guest`).

Stop:

```bash
docker compose down
```

Full stack (all services built from Dockerfiles):

```bash
docker compose up --build
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

## Tests

```bash
pnpm test
pnpm run test:e2e
```
