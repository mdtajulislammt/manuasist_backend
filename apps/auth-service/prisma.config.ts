import { existsSync } from 'fs';
import { resolve } from 'path';
import { config as loadEnv } from 'dotenv';
import { defineConfig, env } from 'prisma/config';

// Prisma resolves env() before any implicit .env load; load files explicitly so
// AUTH_DATABASE_URL works from repo root or apps/auth-service.
const cwd = process.cwd();
const envInCwd = resolve(cwd, '.env');
const envInMonorepo = resolve(cwd, 'apps/auth-service/.env');
if (existsSync(envInCwd)) {
  loadEnv({ path: envInCwd });
}
if (existsSync(envInMonorepo)) {
  loadEnv({ path: envInMonorepo, override: true });
}

export default defineConfig({
  schema: 'prisma/schema.prisma',
  migrations: {
    path: 'prisma/migrations',
  },
  datasource: {
    url: env('AUTH_DATABASE_URL'),
  },
});
