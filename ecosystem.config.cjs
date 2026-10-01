const path = require('path');

const root = __dirname;

/** PM2 production process list — run from repo root after `pnpm run build`. */
module.exports = {
  apps: [
    {
      name: 'menu-auth',
      cwd: root,
      script: 'dist/apps/auth-service/apps/auth-service/src/main.js',
      env: { NODE_ENV: 'production' },
    },
    {
      name: 'menu-admin',
      cwd: root,
      script: 'dist/apps/admin-service/apps/admin-service/src/main.js',
      env: { NODE_ENV: 'production' },
    },
    {
      name: 'menu-application',
      cwd: root,
      script:
        'dist/apps/application-service/apps/application-service/src/main.js',
      env: { NODE_ENV: 'production' },
    },
    {
      name: 'menu-ai',
      cwd: root,
      script:
        'dist/apps/ai-ingestion-service/apps/ai-ingestion-service/src/main.js',
      env: { NODE_ENV: 'production' },
    },
    {
      name: 'menu-gateway',
      cwd: root,
      script: 'dist/apps/api-gateway/apps/api-gateway/src/main.js',
      env: { NODE_ENV: 'production' },
    },
  ],
};
