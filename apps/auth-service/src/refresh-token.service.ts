import { Injectable, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { createHash, randomBytes, randomUUID } from 'node:crypto';
import { PrismaService } from './prisma.service';
import { AccessJwtService } from './access-jwt.service';

function sha256Hex(value: string): string {
  return createHash('sha256').update(value, 'utf8').digest('hex');
}

export type TokenPairResponse = {
  access_token: string;
  token_type: 'Bearer';
  expires_in: number;
  refresh_token: string;
};

@Injectable()
export class RefreshTokenService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly accessJwt: AccessJwtService,
    private readonly config: ConfigService,
  ) { }

  private refreshTtlMs(): number {
    const sec = this.config.get<number>('REFRESH_TOKEN_TTL_SECONDS') ?? 60 * 60 * 24 * 7;
    return sec * 1000;
  }

  private accessTtlSec(): number {
    return this.config.get<number>('ACCESS_TOKEN_TTL_SECONDS') ?? 900;
  }

  async issuePairForUser(userId: string): Promise<TokenPairResponse> {
    const user = await this.prisma.authUser.findUniqueOrThrow({
      where: { id: userId },
      include: { roles: { include: { role: true } } },
    });
    const roleNames = user.roles.map((ur) => ur.role.name);
    const access_token = await this.accessJwt.signAccessToken(userId, roleNames);
    const refresh_token = await this.createRefreshToken(userId, randomUUID());
    return {
      access_token,
      token_type: 'Bearer',
      expires_in: this.accessTtlSec(),
      refresh_token,
    };
  }

  private async createRefreshToken(userId: string, familyId: string) {
    const raw = randomBytes(48).toString('base64url');
    const tokenLookup = sha256Hex(raw);
    const expiresAt = new Date(Date.now() + this.refreshTtlMs());
    await this.prisma.authRefreshToken.create({
      data: {
        userId,
        familyId,
        tokenLookup,
        expiresAt,
      },
    });
    return raw;
  }

  async rotate(refreshRaw: string): Promise<TokenPairResponse> {
    const tokenLookup = sha256Hex(refreshRaw);
    const row = await this.prisma.authRefreshToken.findUnique({
      where: { tokenLookup },
      include: {
        user: {
          include: { roles: { include: { role: true } } },
        },
      },
    });

    if (!row || row.revokedAt) {
      throw new UnauthorizedException('Invalid refresh token');
    }
    if (row.expiresAt < new Date()) {
      throw new UnauthorizedException('Refresh token expired');
    }

    if (row.replacedById) {
      await this.revokeFamily(row.familyId);
      throw new UnauthorizedException('Refresh token reuse detected');
    }

    const userId = row.userId;
    const familyId = row.familyId;
    const roleNames = row.user.roles.map((ur) => ur.role.name);

    const newRaw = randomBytes(48).toString('base64url');
    const newLookup = sha256Hex(newRaw);
    const expiresAt = new Date(Date.now() + this.refreshTtlMs());

    const newRow = await this.prisma.authRefreshToken.create({
      data: {
        userId,
        familyId,
        tokenLookup: newLookup,
        expiresAt,
      },
    });

    await this.prisma.authRefreshToken.update({
      where: { id: row.id },
      data: { replacedById: newRow.id },
    });

    const access_token = await this.accessJwt.signAccessToken(userId, roleNames);
    return {
      access_token,
      token_type: 'Bearer',
      expires_in: this.accessTtlSec(),
      refresh_token: newRaw,
    };
  }

  async revoke(refreshRaw: string): Promise<void> {
    const tokenLookup = sha256Hex(refreshRaw);
    const row = await this.prisma.authRefreshToken.findUnique({
      where: { tokenLookup },
    });
    if (!row) {
      return;
    }
    await this.revokeFamily(row.familyId);
  }

  private async revokeFamily(familyId: string) {
    await this.prisma.authRefreshToken.updateMany({
      where: { familyId },
      data: { revokedAt: new Date() },
    });
  }
}
