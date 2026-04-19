import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { join } from 'node:path';
import { AccessJwtService } from './access-jwt.service';
import { AuthTokensController } from './auth-tokens.controller';
import { HealthController } from './health.controller';
import { OAuthController } from './oauth.controller';
import { OidcService } from './oidc.service';
import { PkceStateStore } from './pkce-state.store';
import { PrismaModule } from './prisma.module';
import { RefreshTokenService } from './refresh-token.service';
import { RolesSeedService } from './roles-seed.service';
import { UserSyncService } from './user-sync.service';
import { WellKnownController } from './well-known.controller';

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
    OAuthController,
    AuthTokensController,
    WellKnownController,
  ],
  providers: [
    RolesSeedService,
    AccessJwtService,
    PkceStateStore,
    UserSyncService,
    RefreshTokenService,
    OidcService,
  ],
})
export class AppModule { }
