import { ApiAuthModule } from '@menu-assist/api-auth';
import { FileStorageModule } from '@menu-assist/file-storage';
import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { join } from 'node:path';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { ApplicationOnboardingModule } from './onboarding/application-onboarding.module';
import { HealthController } from './health.controller';
import { PrismaModule } from './prisma.module';
import { InternalModule } from './internal/internal.module';
import { MembershipModule } from './membership/membership.module';
import { ReferralsModule } from './referrals/referrals.module';
import { UsersMeModule } from './users-me/users-me.module';
import { HomeModule } from './home/home.module';
import { NotificationsModule } from './notifications/notifications.module';
import { BookmarksModule } from './bookmarks/bookmarks.module';
import { MealsModule } from './meals/meals.module';

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
    PrismaModule,
    FileStorageModule.forRootAsync({
      imports: [ConfigModule],
      inject: [ConfigService],
      useFactory: (config: ConfigService) => {
        const bucket = config.get<string>('AWS_S3_BUCKET');
        const region = config.get<string>('AWS_REGION');
        return {
          localRoot: config.get<string>('FILE_STORAGE_LOCAL_ROOT') ?? 'uploads',
          s3:
            bucket && region
              ? {
                bucket,
                region,
                accessKeyId: config.get<string>('AWS_ACCESS_KEY_ID'),
                secretAccessKey: config.get<string>('AWS_SECRET_ACCESS_KEY'),
                publicBaseUrl: config.get<string>('AWS_S3_PUBLIC_BASE_URL'),
              }
              : undefined,
        };
      },
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
    UsersMeModule,
    MembershipModule,
    ReferralsModule,
    ApplicationOnboardingModule,
    InternalModule,
    HomeModule,
    NotificationsModule,
    BookmarksModule,
    MealsModule,
  ],
  controllers: [AppController, HealthController],
  providers: [AppService],
})
export class AppModule { }
