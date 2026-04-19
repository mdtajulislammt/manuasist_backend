import { ApiAuthModule } from '@menu-assist/api-auth';
import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { join } from 'node:path';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { HealthController } from './health.controller';

const envFilePaths = [
  join(process.cwd(), '.env'),
  join(process.cwd(), 'apps', 'application-service', '.env'),
];

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      envFilePath: envFilePaths,
    }),
    ApiAuthModule.forRootAsync({
      imports: [ConfigModule],
      useFactory: (config: ConfigService) => ({
        jwksUri: config.getOrThrow<string>('AUTH_JWKS_URI'),
        issuer: config.getOrThrow<string>('AUTH_JWT_ISSUER'),
        audience: config.getOrThrow<string>('AUTH_JWT_AUDIENCE'),
      }),
      inject: [ConfigService],
    }),
  ],
  controllers: [AppController, HealthController],
  providers: [AppService],
})
export class AppModule {}
