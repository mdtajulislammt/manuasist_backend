import { ApiAuthModule } from '@menu-assist/api-auth';
import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { join } from 'node:path';
import { HealthController } from './health.controller';
import { OnboardingModule } from './onboarding/onboarding.module';
import { PrismaModule } from './prisma.module';

const envFilePaths = [
  join(process.cwd(), '.env'),
  join(process.cwd(), 'apps', 'admin-service', '.env'),
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
    OnboardingModule,
  ],
  controllers: [HealthController],
  providers: [],
})
export class AppModule {}
