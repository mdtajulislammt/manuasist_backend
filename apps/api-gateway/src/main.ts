import { existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { GlobalExceptionFilter } from '@api-auth/global-exception.filter';
import { HttpException, Logger } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import {
  ExpressAdapter,
  NestExpressApplication,
} from '@nestjs/platform-express';
import { config as loadEnv } from 'dotenv';
import express, { json } from 'express';
import { AppModule } from './app.module';
import { GatewayProxyService } from './gateway-proxy.service';
import { createRequestTraceMiddleware } from './request-trace.middleware';

const logger = new Logger('ApiGateway');

function loadGatewayEnv() {
  const root = resolve(process.cwd(), '.env');
  const local = resolve(process.cwd(), 'apps/api-gateway/.env');
  if (existsSync(root)) {
    loadEnv({ path: root });
  }
  if (existsSync(local)) {
    loadEnv({ path: local, override: true });
  }
}

function resolveExceptionMessage(error: unknown): string {
  if (error instanceof HttpException) {
    const res = error.getResponse();
    if (typeof res === 'string') {
      return res;
    }
    if (typeof res === 'object' && res !== null) {
      const maybeMessage = (res as { message?: unknown }).message;
      if (typeof maybeMessage === 'string') {
        return maybeMessage;
      }
      if (Array.isArray(maybeMessage)) {
        return maybeMessage.map(String).join(', ');
      }
    }
    return error.message;
  }
  if (error instanceof Error) {
    return error.message;
  }
  return String(error);
}

/**
 * API Gateway for the Menu Assist application.
 * It proxies requests to the upstream services (auth, application, admin, ai-ingestion).
 */
async function bootstrap() {
  loadGatewayEnv();

  process.on('unhandledRejection', (reason) => {
    logger.error(
      'Unhandled rejection (gateway kept alive)',
      reason instanceof Error ? reason.stack : String(reason),
    );
  });

  const expressApp = express();
  expressApp.set('trust proxy', true);
  expressApp.use(createRequestTraceMiddleware());
  expressApp.use(json({ limit: '2mb' }));

  const app = await NestFactory.create<NestExpressApplication>(
    AppModule,
    new ExpressAdapter(expressApp),
    { bodyParser: false },
  );
  app.useGlobalFilters(new GlobalExceptionFilter());

  // Enable cors
  const corsOrigin = process.env.CORS_ORIGIN?.split(',') || [
    'http://localhost:3001',
    'http://localhost:3000',
    'http://localhost:3002',
    'http://10.10.9.82:3001',
    'http://10.10.9.82:3002',
    'http://10.10.9.82:3000',
    'https://menuassistanikstudio-phi.vercel.app',
  ];
  app.enableCors({ origin: corsOrigin, credentials: true });

  const proxy = app.get(GatewayProxyService);

  const mounts = [
    ['/v1/auth', '/v1/auth', 'AUTH_SERVICE_URL'],
    ['/v1/app', '/v1/app', 'APPLICATION_SERVICE_URL'],
    ['/v1/admin', '/v1/admin', 'ADMIN_SERVICE_URL'],
    ['/v1/ingestion', '/v1/ingestion', 'AI_INGESTION_SERVICE_URL'],
  ] as const;

  for (const [mountPath, routePrefix, envKey] of mounts) {
    app.use(mountPath, async (req: any, res: any, next: any) => {
      try {
        await proxy.proxyTo(req, res, routePrefix, envKey);
      } catch (error) {
        if (res.headersSent) {
          next(error);
          return;
        }
        const status =
          error instanceof HttpException ? error.getStatus() : 502;
        const message = resolveExceptionMessage(error);
        logger.error(`${req.method} ${req.originalUrl} -> ${status}: ${message}`);
        res.status(status).json({
          success: false,
          message,
          status,
        });
      }
    });
  }

  await app.listen(process.env.API_GATEWAY_PORT ?? 2645);
}

bootstrap();
