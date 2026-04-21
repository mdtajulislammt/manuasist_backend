import { ApiAuthModule } from '@menu-assist/api-auth';
import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { join } from 'node:path';
import { EventsListenerController } from './events/events.listener';
import { HealthController } from './health.controller';
import { InternalModule } from './internal/internal.module';
import { PrismaModule } from './prisma.module';
import { ScansModule } from './scans/scans.module';

const envFilePaths = [
  join(process.cwd(), '.env'),
  join(process.cwd(), 'apps', 'ai-ingestion-service', '.env'),
];

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      envFilePath: envFilePaths,
    }),
    PrismaModule,
    ApiAuthModule.forRootAsync({
      imports: [ConfigModule],
      useFactory: (config: ConfigService) => ({
        jwksUri: config.getOrThrow<string>('AUTH_JWKS_URI'),
        issuer: config.getOrThrow<string>('AUTH_JWT_ISSUER'),
        audience: config.getOrThrow<string>('AUTH_JWT_AUDIENCE'),
      }),
      inject: [ConfigService],
    }),
    ScansModule,
    InternalModule,
  ],
  controllers: [HealthController, EventsListenerController],
  providers: [],
})
export class AppModule {}
