import { UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { createPublicKey, generateKeyPairSync, randomBytes } from 'node:crypto';
import { jwtVerify } from 'jose';
import type { PrismaService } from './prisma.service';

/** openid-client is ESM; Jest loads AuthService which imports it — provide a stub. */
jest.mock('openid-client', () => ({
  authorizationCodeGrant: jest.fn(),
  buildAuthorizationUrl: jest.fn(),
  calculatePKCECodeChallenge: jest.fn(() => Promise.resolve('challenge')),
  ClientSecretPost: jest.fn(() => ({})),
  discovery: jest.fn(() => Promise.resolve({})),
  None: jest.fn(() => ({})),
  randomPKCECodeVerifier: jest.fn(() => 'verifier'),
  randomState: jest.fn(() => 'state'),
}));

jest.mock('./prisma.service', () => ({
  PrismaService: class PrismaService { },
}));

import { AuthService } from './auth.service';

jest.mock('node:crypto', () => {
  const actual = jest.requireActual<typeof import('node:crypto')>('node:crypto');
  return {
    ...actual,
    randomBytes: jest.fn(),
    randomUUID: jest.fn(() => '00000000-0000-4000-8000-000000000001'),
  };
});

const mockedRandomBytes = randomBytes as jest.MockedFunction<typeof randomBytes>;

describe('AuthService JWT', () => {
  const { privateKey, publicKey } = generateKeyPairSync('rsa', {
    modulusLength: 2048,
    publicKeyEncoding: { type: 'spki', format: 'pem' },
    privateKeyEncoding: { type: 'pkcs8', format: 'pem' },
  });

  let service: AuthService;

  beforeEach(async () => {
    const prisma = {
      role: {
        upsert: jest.fn().mockResolvedValue({}),
      },
    };
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
    service = new AuthService(
      prisma as unknown as PrismaService,
      config as unknown as ConfigService,
    );
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

describe('AuthService refresh', () => {
  let prisma: {
    role: { upsert: jest.Mock };
    authRefreshToken: {
      findUnique: jest.Mock;
      create: jest.Mock;
      update: jest.Mock;
      updateMany: jest.Mock;
    };
    authUser: {
      findUniqueOrThrow: jest.Mock;
    };
  };
  let service: AuthService;

  beforeEach(async () => {
    mockedRandomBytes.mockImplementation((size: number) =>
      Buffer.alloc(size, 7),
    );

    const { privateKey, publicKey } = generateKeyPairSync('rsa', {
      modulusLength: 2048,
      publicKeyEncoding: { type: 'spki', format: 'pem' },
      privateKeyEncoding: { type: 'pkcs8', format: 'pem' },
    });

    prisma = {
      role: {
        upsert: jest.fn().mockResolvedValue({}),
      },
      authRefreshToken: {
        findUnique: jest.fn(),
        create: jest.fn(),
        update: jest.fn(),
        updateMany: jest.fn(),
      },
      authUser: {
        findUniqueOrThrow: jest.fn(),
      },
    };

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
      get: jest.fn().mockImplementation((k: string, def?: number) => {
        if (k === 'JWT_KID') return 'test-kid';
        if (k === 'ACCESS_TOKEN_TTL_SECONDS') return def ?? 900;
        if (k === 'REFRESH_TOKEN_TTL_SECONDS') return def ?? 604800;
        return def;
      }),
    };

    service = new AuthService(
      prisma as unknown as PrismaService,
      config as unknown as ConfigService,
    );
    await service.onModuleInit();
  });

  it('rotate issues new refresh and marks old row replaced', async () => {
    const userRow = {
      id: 'user-1',
      userId: 'user-1',
      familyId: 'fam-1',
      tokenLookup: 'lookup-old',
      expiresAt: new Date(Date.now() + 60_000),
      replacedById: null,
      revokedAt: null,
      user: {
        roles: [{ role: { name: 'user' } }],
      },
    };
    prisma.authRefreshToken.findUnique.mockResolvedValue(userRow as never);
    prisma.authRefreshToken.create.mockResolvedValue({
      id: 'new-row-id',
    } as never);
    prisma.authRefreshToken.update.mockResolvedValue({} as never);

    const out = await service.rotate('opaque-refresh');

    expect(prisma.authRefreshToken.create).toHaveBeenCalled();
    expect(prisma.authRefreshToken.update).toHaveBeenCalledWith({
      where: { id: userRow.id },
      data: { replacedById: 'new-row-id' },
    });
    expect(out.access_token).toBeDefined();
    expect(out.refresh_token).toBeDefined();
  });

  it('rotate revokes family and rejects when old token is reused', async () => {
    const userRow = {
      id: 'row-old',
      userId: 'user-1',
      familyId: 'fam-1',
      tokenLookup: 'lookup-old',
      expiresAt: new Date(Date.now() + 60_000),
      replacedById: 'already-rotated',
      revokedAt: null,
      user: {
        roles: [{ role: { name: 'user' } }],
      },
    };
    prisma.authRefreshToken.findUnique.mockResolvedValue(userRow as never);

    await expect(service.rotate('stolen-refresh')).rejects.toBeInstanceOf(
      UnauthorizedException,
    );
    expect(prisma.authRefreshToken.updateMany).toHaveBeenCalledWith({
      where: { familyId: 'fam-1' },
      data: expect.objectContaining({ revokedAt: expect.any(Date) }),
    });
  });
});

describe('AuthService User Retrieval and Search', () => {
  let prisma: {
    role: { upsert: jest.Mock };
    authUser: {
      findMany: jest.Mock;
      count: jest.Mock;
      findUnique: jest.Mock;
    };
  };
  let service: AuthService;
  const mockFetch = jest.fn();

  beforeEach(async () => {
    mockFetch.mockReset();
    global.fetch = mockFetch as any;

    const { privateKey, publicKey } = generateKeyPairSync('rsa', {
      modulusLength: 2048,
      publicKeyEncoding: { type: 'spki', format: 'pem' },
      privateKeyEncoding: { type: 'pkcs8', format: 'pem' },
    });

    prisma = {
      role: {
        upsert: jest.fn().mockResolvedValue({}),
      },
      authUser: {
        findMany: jest.fn(),
        count: jest.fn(),
        findUnique: jest.fn(),
      },
    };

    const config = {
      getOrThrow: (k: string) => {
        const map: Record<string, string | number> = {
          JWT_PRIVATE_KEY: privateKey,
          JWT_PUBLIC_KEY: publicKey,
          JWT_ISSUER: 'http://test',
          JWT_AUDIENCE: 'menu-assist-api',
          JWT_KID: 'test-kid',
          ACCESS_TOKEN_TTL_SECONDS: 60,
          APPLICATION_SERVICE_URL: 'http://application-service',
          APPLICATION_INTERNAL_API_KEY: 'internal-key',
        };
        return map[k];
      },
      get: (k: string) => (k === 'JWT_KID' ? 'test-kid' : undefined),
    };

    service = new AuthService(
      prisma as unknown as PrismaService,
      config as unknown as ConfigService,
    );
    await service.onModuleInit();
  });

  it('getUserById retrieves user and merges profile', async () => {
    const userRow = {
      id: 'user-123',
      email: 'test@example.com',
      phone: '+1234567890',
      emailVerifiedAt: new Date(),
      phoneVerifiedAt: null,
      referralCode: 'REF123',
      referredById: null,
      createdAt: new Date(),
      updatedAt: new Date(),
      status: 'ACTIVE',
    };
    prisma.authUser.findUnique.mockResolvedValue(userRow);

    mockFetch.mockResolvedValue({
      ok: true,
      json: () =>
        Promise.resolve({
          success: true,
          data: [
            {
              userId: 'user-123',
              id: 'profile-123',
              fullName: 'John Doe',
              avatarFileId: null,
              avatarUrl: null,
              onboardingCompletedAt: null,
              createdAt: new Date(),
              updatedAt: new Date(),
            },
          ],
        }),
    });

    const result: any = await service.getUserById('user-123');

    expect(result.success).toBe(true);
    expect(result.data.id).toBe('user-123');
    expect(result.data.profile).toBeDefined();
    expect(result.data.profile.fullName).toBe('John Doe');
    expect(mockFetch).toHaveBeenCalledWith(
      'http://application-service/internal/users/profiles/batch',
      expect.objectContaining({
        method: 'POST',
        body: JSON.stringify({ userIds: ['user-123'] }),
      }),
    );
  });

  it('getAllUsers searches profiles case-insensitively and returns merged list', async () => {
    const usersRows = [
      {
        id: 'user-123',
        email: 'test@example.com',
        phone: '+1234567890',
        emailVerifiedAt: new Date(),
        phoneVerifiedAt: null,
        createdAt: new Date(),
        updatedAt: new Date(),
        status: 'ACTIVE',
      },
    ];
    prisma.authUser.findMany.mockResolvedValue(usersRows);
    prisma.authUser.count.mockResolvedValue(1);

    mockFetch
      .mockResolvedValueOnce({
        ok: true,
        json: () =>
          Promise.resolve({
            success: true,
            data: [{ userId: 'user-123', fullName: 'John Doe' }],
          }),
      })
      .mockResolvedValueOnce({
        ok: true,
        json: () =>
          Promise.resolve({
            success: true,
            data: [
              {
                userId: 'user-123',
                id: 'profile-123',
                fullName: 'John Doe',
                avatarFileId: null,
                avatarUrl: null,
                onboardingCompletedAt: null,
                createdAt: new Date(),
                updatedAt: new Date(),
              },
            ],
          }),
      });

    const result: any = await service.getAllUsers('John');

    expect(result.success).toBe(true);
    expect(result.data.users).toHaveLength(1);
    expect(result.data.users[0].profile.fullName).toBe('John Doe');
    expect(prisma.authUser.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          OR: expect.arrayContaining([
            { id: { in: ['user-123'] } },
          ]),
        }),
      }),
    );
  });
});
