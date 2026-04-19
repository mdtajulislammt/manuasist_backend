import { UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { randomBytes } from 'node:crypto';

jest.mock('./prisma.service', () => ({
  PrismaService: class PrismaService { },
}));

import { AccessJwtService } from './access-jwt.service';
import type { PrismaService } from './prisma.service';
import { RefreshTokenService } from './refresh-token.service';

type PrismaMock = {
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

jest.mock('node:crypto', () => {
  const actual = jest.requireActual<typeof import('node:crypto')>('node:crypto');
  return {
    ...actual,
    randomBytes: jest.fn(),
    randomUUID: jest.fn(() => '00000000-0000-4000-8000-000000000001'),
  };
});

describe('RefreshTokenService', () => {
  const mockedRandomBytes = randomBytes as jest.MockedFunction<typeof randomBytes>;

  let prisma: PrismaMock;
  let accessJwt: jest.Mocked<Pick<AccessJwtService, 'signAccessToken'>>;
  let config: jest.Mocked<Pick<ConfigService, 'get'>>;
  let service: RefreshTokenService;

  beforeEach(() => {
    mockedRandomBytes.mockImplementation((size: number) =>
      Buffer.alloc(size, 7),
    );
    prisma = {
      authRefreshToken: {
        findUnique: jest.fn(),
        create: jest.fn(),
        update: jest.fn(),
        updateMany: jest.fn(),
      },
      authUser: {
        findUniqueOrThrow: jest.fn(),
      },
    } as PrismaMock;

    accessJwt = {
      signAccessToken: jest.fn().mockResolvedValue('signed-access'),
    };

    config = {
      get: jest.fn().mockImplementation((_k: string, def?: number) => def),
    };

    service = new RefreshTokenService(
      prisma as unknown as PrismaService,
      accessJwt as unknown as AccessJwtService,
      config as unknown as ConfigService,
    );
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
    expect(out.access_token).toBe('signed-access');
    expect(out.refresh_token).toBeDefined();
    expect(accessJwt.signAccessToken).toHaveBeenCalledWith('user-1', ['user']);
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
