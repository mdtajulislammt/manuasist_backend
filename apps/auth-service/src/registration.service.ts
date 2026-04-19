import {
  BadRequestException,
  ConflictException,
  Injectable,
} from '@nestjs/common';
import * as bcrypt from 'bcrypt';
import { PrismaService } from './prisma.service';
import { RefreshTokenService, type TokenPairResponse } from './refresh-token.service';

const BCRYPT_ROUNDS = 12;

@Injectable()
export class RegistrationService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly refreshTokens: RefreshTokenService,
  ) {}

  async registerWithEmailPassword(
    email: string,
    password: string,
    confirmPassword: string,
  ): Promise<TokenPairResponse> {
    if (password !== confirmPassword) {
      throw new BadRequestException(
        'Password and confirm password do not match',
      );
    }

    const normalized = email.trim().toLowerCase();
    if (!normalized) {
      throw new BadRequestException('Email is required');
    }

    const existing = await this.prisma.authUser.findUnique({
      where: { email: normalized },
    });
    if (existing) {
      throw new ConflictException('An account with this email already exists');
    }

    const passwordHash = await bcrypt.hash(password, BCRYPT_ROUNDS);
    const user = await this.prisma.authUser.create({
      data: {
        email: normalized,
        passwordHash,
        roles: {
          create: {
            role: { connect: { name: 'user' } },
          },
        },
      },
    });

    return this.refreshTokens.issuePairForUser(user.id);
  }
}
