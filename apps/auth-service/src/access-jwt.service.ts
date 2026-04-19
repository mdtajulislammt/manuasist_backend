import { Injectable, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { exportJWK, importPKCS8, importSPKI, SignJWT } from 'jose';
import type { JWK } from 'jose';

@Injectable()
export class AccessJwtService implements OnModuleInit {
  private privateKey!: CryptoKey;
  private jwksBody!: { keys: JWK[] };

  constructor(private readonly config: ConfigService) { }

  async onModuleInit() {
    const privatePem = this.config.getOrThrow<string>('JWT_PRIVATE_KEY');
    const publicPem = this.config.getOrThrow<string>('JWT_PUBLIC_KEY');
    this.privateKey = await importPKCS8(privatePem, 'RS256');
    const pub = await importSPKI(publicPem, 'RS256');
    const jwk = (await exportJWK(pub)) as JWK;
    const kid = this.config.get<string>('JWT_KID') ?? 'menu-assist-rs256';
    jwk.kid = kid;
    jwk.use = 'sig';
    jwk.alg = 'RS256';
    this.jwksBody = { keys: [jwk] };
  }

  getJwks() {
    return this.jwksBody;
  }

  async signAccessToken(userId: string, roles: string[]) {
    const issuer = this.config.getOrThrow<string>('JWT_ISSUER');
    const audience = this.config.getOrThrow<string>('JWT_AUDIENCE');
    const ttl = this.config.get<number>('ACCESS_TOKEN_TTL_SECONDS') ?? 900;
    const kid = this.config.get<string>('JWT_KID') ?? 'menu-assist-rs256';

    return new SignJWT({ roles })
      .setProtectedHeader({ alg: 'RS256', kid })
      .setSubject(userId)
      .setIssuer(issuer)
      .setAudience(audience)
      .setIssuedAt()
      .setExpirationTime(`${ttl}s`)
      .sign(this.privateKey);
  }
}
