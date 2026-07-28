import { BullModule } from '@nestjs/bullmq';
import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { join } from 'node:path';
import {
  AuthController,
  InternalAuthController,
  OAuthController,
  WellKnownController,
} from './auth.controller';
import { AuthService } from './auth.service';
import { HealthController } from './health.controller';
import { InternalApiKeyGuard } from './internal-api-key.guard';
import { AuthOtpModule } from './otp/auth-otp.module';
import { PrismaModule } from './prisma.module';

const envFilePaths = [
  join(process.cwd(), '.env'),
  join(process.cwd(), 'apps', 'auth-service', '.env'),
];

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      envFilePath: envFilePaths,
    }),
    BullModule.forRootAsync({
      imports: [ConfigModule],
      inject: [ConfigService],
      useFactory: (config: ConfigService) => ({
        connection: {
          url: config.get<string>('REDIS_URL') ?? 'redis://127.0.0.1:6379',
          maxRetriesPerRequest: null,
        },
      }),
    }),
    PrismaModule,
    AuthOtpModule,
  ],
  controllers: [
    HealthController,
    AuthController,
    InternalAuthController,
    OAuthController,
    WellKnownController,
  ],
  providers: [AuthService, InternalApiKeyGuard],
})
export class AppModule {}
