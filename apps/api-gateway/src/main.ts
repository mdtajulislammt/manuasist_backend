import { GlobalExceptionFilter } from '@api-auth/global-exception.filter';
import { NestFactory } from '@nestjs/core';
import {
  ExpressAdapter,
  NestExpressApplication,
} from '@nestjs/platform-express';
import express, { json } from 'express';
import { AppModule } from './app.module';
import { GatewayProxyService } from './gateway-proxy.service';
import { createRequestTraceMiddleware } from './request-trace.middleware';

/**
 * API Gateway for the Menu Assist application.
 * It proxies requests to the upstream services (auth, application, admin, ai-ingestion).
 */
async function bootstrap() {
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
  const corsOrigin = process.env.CORS_ORIGIN?.split(",") || ['http://localhost:3001', 'http://localhost:3000', 'http://localhost:3002', 'http://10.10.9.82:3001', 'http://10.10.9.82:3002', 'http://10.10.9.82:3000'];
  app.enableCors({ origin: corsOrigin, credentials: true });

  const proxy = app.get(GatewayProxyService);

  const mounts = [
    ['/v1/auth', '/v1/auth', 'AUTH_SERVICE_URL'],
    ['/v1/app', '/v1/app', 'APPLICATION_SERVICE_URL'],
    ['/v1/admin', '/v1/admin', 'ADMIN_SERVICE_URL'],
    ['/v1/ingestion', '/v1/ingestion', 'AI_INGESTION_SERVICE_URL'],
  ] as const;

  for (const [mountPath, routePrefix, envKey] of mounts) {
    app.use(mountPath, (req: any, res: any) =>
      proxy.proxyTo(req, res, routePrefix, envKey),
    );
  }

  await app.listen(process.env.API_GATEWAY_PORT ?? 2645);
}

bootstrap();
