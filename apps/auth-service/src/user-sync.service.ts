import { Injectable } from '@nestjs/common';
import { PrismaService } from './prisma.service';
import { RolesSeedService } from './roles-seed.service';

@Injectable()
export class UserSyncService {
  constructor(
    private readonly prisma: PrismaService,
    _rolesSeed: RolesSeedService,
  ) { }

  async upsertOidcUser(
    issuer: string,
    subject: string,
    email: string | undefined | null,
  ) {
    const existing = await this.prisma.authIdentity.findUnique({
      where: {
        issuer_subject: { issuer, subject },
      },
      include: {
        user: {
          include: {
            roles: { include: { role: true } },
          },
        },
      },
    });

    if (existing) {
      if (email && existing.user.email !== email) {
        await this.prisma.authUser.update({
          where: { id: existing.userId },
          data: { email },
        });
        await this.prisma.authIdentity.update({
          where: { id: existing.id },
          data: { email },
        });
      }
      return existing.user;
    }

    return this.prisma.authUser.create({
      data: {
        email: email ?? undefined,
        identities: {
          create: {
            issuer,
            subject,
            email: email ?? undefined,
          },
        },
        roles: {
          create: {
            role: { connect: { name: 'user' } },
          },
        },
      },
      include: {
        roles: { include: { role: true } },
      },
    });
  }
}
