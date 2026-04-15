# Microservices (service-isolated layout)

The Nest **monorepo** lives under `apps/` with shared libraries in `libs/`. Each service now has its own `package.json` and its own Prisma schema under `apps/<service>/prisma/schema.prisma`.

Dependency ownership is per service package. Root tooling stays at the workspace root, while install behavior is set to nested in `.npmrc` to keep dependency trees service-oriented.

## Services and ports

| App                     | Port | Role                                      |
| ----------------------- | ---- | ----------------------------------------- |
| `auth-service`          | 3001 | Stub (health only until you add routes)   |
| `application-service`   | 3002 | Migrated app from root `src/` + Prisma    |
| `admin-service`         | 3003 | Stub (health only)                       |
| `ai-ingestion-service`  | 3004 | HTTP health + **RabbitMQ** consumer stub |

## Environment and database ownership

- **`APPLICATION_DATABASE_URL`** — `application-service` database.
- **`AUTH_DATABASE_URL`** — `auth-service` database.
- **`ADMIN_DATABASE_URL`** — `admin-service` database.
- **`AI_INGESTION_DATABASE_URL`** — `ai-ingestion-service` database.
- **`RABBITMQ_URL`** — AMQP URL. Default in code: `amqp://guest:guest@127.0.0.1:5672`. In Docker Compose: `amqp://guest:guest@rabbitmq:5672`.
- **Ports** — override with `AUTH_SERVICE_PORT`, `APPLICATION_SERVICE_PORT`, `ADMIN_SERVICE_PORT`, `AI_INGESTION_SERVICE_PORT`.

Postgres startup creates one database per service via `docker/postgres/init/01-create-service-databases.sql`.

## Local scripts

```bash
npm install
npm run prisma:generate:all
npm run build
npm run start:dev:application   # or :auth, :admin, :ai
```

`npm run build:ai` requires **`@nestjs/microservices`** and **`amqplib`**. If `npm install` fails on your machine, resolve that first (or rely on Docker `npm install` inside the image).

## Docker Compose

```bash
docker compose -f docker-compose.phase1.yml up --build
```

Starts Postgres, RabbitMQ (management UI on **15672**), and all four services. `depends_on` does not wait for readiness; wait for Postgres/RabbitMQ health in production.

## Messaging

- Topic exchange: **`menu_assist.events`** (see [`libs/messaging`](libs/messaging)).
- Event names: [`libs/contracts/src/events.ts`](libs/contracts/src/events.ts).
- `ai-ingestion-service` listens for **`system.ping.v1`** as a placeholder; add publishers with `createRmqEventClientProvider` when you implement domains.
