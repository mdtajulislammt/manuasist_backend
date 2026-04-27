import { existsSync } from 'fs';
import { resolve } from 'path';
import { config as loadEnv } from 'dotenv';
import { defineConfig, env } from 'prisma/config';

const cwd = process.cwd();
const envInCwd = resolve(cwd, '.env');
const envInMonorepo = resolve(cwd, 'apps/application-service/.env');
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
    url: env('APPLICATION_DATABASE_URL'),
  },
});
