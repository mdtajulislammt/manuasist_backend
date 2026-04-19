import { ConfigService } from '@nestjs/config';
import { createPublicKey, generateKeyPairSync } from 'node:crypto';
import { jwtVerify } from 'jose';
import { AccessJwtService } from './access-jwt.service';

describe('AccessJwtService', () => {
  const { privateKey, publicKey } = generateKeyPairSync('rsa', {
    modulusLength: 2048,
    publicKeyEncoding: { type: 'spki', format: 'pem' },
    privateKeyEncoding: { type: 'pkcs8', format: 'pem' },
  });

  let service: AccessJwtService;

  beforeEach(async () => {
    const config = {
      getOrThrow: (k: string) => {
        const map: Record<string, string | number> = {
          JWT_PRIVATE_KEY: privateKey,
          JWT_PUBLIC_KEY: publicKey,
          JWT_ISSUER: 'http://test',
          JWT_AUDIENCE: 'menu-assist-api',
          JWT_KID: 'test-kid',
          ACCESS_TOKEN_TTL_SECONDS: 60,
        };
        return map[k];
      },
      get: (k: string) => (k === 'JWT_KID' ? 'test-kid' : undefined),
    };
    service = new AccessJwtService(config as unknown as ConfigService);
    await service.onModuleInit();
  });

  it('signs JWTs verifiable with the public key', async () => {
    const token = await service.signAccessToken('user-uuid', ['user', 'admin']);
    const pub = createPublicKey(publicKey);
    const { payload } = await jwtVerify(token, pub, {
      issuer: 'http://test',
      audience: 'menu-assist-api',
    });
    expect(payload.sub).toBe('user-uuid');
    expect(payload.roles).toEqual(['user', 'admin']);
  });

  it('exposes JWKS containing the public JWK', () => {
    const jwks = service.getJwks();
    expect(jwks.keys).toHaveLength(1);
    expect(jwks.keys[0].kid).toBe('test-kid');
    expect(jwks.keys[0].alg).toBe('RS256');
  });
});
