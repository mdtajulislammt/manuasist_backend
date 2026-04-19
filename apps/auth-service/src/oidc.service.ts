import {
  BadRequestException,
  Injectable,
  InternalServerErrorException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { decodeJwt } from 'jose';
import type { Configuration } from 'openid-client';
import {
  authorizationCodeGrant,
  buildAuthorizationUrl,
  calculatePKCECodeChallenge,
  ClientSecretPost,
  discovery,
  None,
  randomPKCECodeVerifier,
  randomState,
} from 'openid-client';
import { PkceStateStore } from './pkce-state.store';
import { RefreshTokenService } from './refresh-token.service';
import { UserSyncService } from './user-sync.service';

@Injectable()
export class OidcService {
  private configuration?: Promise<Configuration>;

  constructor(
    private readonly config: ConfigService,
    private readonly pkceStore: PkceStateStore,
    private readonly userSync: UserSyncService,
    private readonly refreshTokens: RefreshTokenService,
  ) {}

  private getOidcConfiguration(): Promise<Configuration> {
    if (!this.configuration) {
      const issuer = new URL(this.config.getOrThrow<string>('OIDC_ISSUER'));
      const clientId = this.config.getOrThrow<string>('OIDC_CLIENT_ID');
      const clientSecret = this.config.get<string>('OIDC_CLIENT_SECRET');
      const auth = clientSecret
        ? ClientSecretPost(clientSecret)
        : None();
      const meta = clientSecret
        ? { client_secret: clientSecret }
        : ({} as Record<string, never>);
      this.configuration = discovery(issuer, clientId, meta, auth);
    }
    return this.configuration;
  }

  async buildAuthorizationRedirect(): Promise<string> {
    const oidc = await this.getOidcConfiguration();
    const redirectUri = this.config.getOrThrow<string>('OIDC_REDIRECT_URI');
    const scope =
      this.config.get<string>('OIDC_SCOPES') ?? 'openid profile email';

    const codeVerifier = randomPKCECodeVerifier();
    const codeChallenge = await calculatePKCECodeChallenge(codeVerifier);
    const state = randomState();
    this.pkceStore.set(state, codeVerifier);

    const url = buildAuthorizationUrl(oidc, {
      redirect_uri: redirectUri,
      scope,
      code_challenge: codeChallenge,
      code_challenge_method: 'S256',
      state,
    });
    return url.href;
  }

  async handleCallback(callbackUrl: URL) {
    const oidc = await this.getOidcConfiguration();
    const state = callbackUrl.searchParams.get('state');
    if (!state) {
      throw new BadRequestException('Missing state');
    }
    const codeVerifier = this.pkceStore.take(state);
    if (!codeVerifier) {
      throw new BadRequestException('Invalid or expired OAuth state');
    }

    const tokens = await authorizationCodeGrant(oidc, callbackUrl, {
      pkceCodeVerifier: codeVerifier,
      expectedState: state,
    });

    const idToken = tokens.id_token;
    if (typeof idToken !== 'string' || !idToken) {
      throw new InternalServerErrorException('IdP did not return an id_token');
    }

    const claims = decodeJwt(idToken) as Record<string, unknown>;
    const iss = typeof claims.iss === 'string' ? claims.iss : undefined;
    const sub = typeof claims.sub === 'string' ? claims.sub : undefined;
    if (!iss || !sub) {
      throw new InternalServerErrorException('id_token missing iss or sub');
    }

    const email =
      typeof claims.email === 'string'
        ? claims.email
        : typeof claims.preferred_username === 'string'
          ? claims.preferred_username
          : undefined;

    const user = await this.userSync.upsertOidcUser(iss, sub, email);
    return this.refreshTokens.issuePairForUser(user.id);
  }
}
