import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { join } from 'node:path';
import {
  AuthController,
  OAuthController,
  WellKnownController,
} from './auth.controller';
import { AuthService } from './auth.service';
import { HealthController } from './health.controller';
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
    PrismaModule,
  ],
  controllers: [
    HealthController,
    AuthController,
    OAuthController,
    WellKnownController,
  ],
  providers: [AuthService],
})
export class AppModule { }
