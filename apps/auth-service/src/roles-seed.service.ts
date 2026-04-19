import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { Prisma } from '../generated/prisma/client';
import { PrismaService } from './prisma.service';

@Injectable()
export class RolesSeedService implements OnModuleInit {
  private readonly logger = new Logger(RolesSeedService.name);

  constructor(private readonly prisma: PrismaService) {}

  async onModuleInit() {
    const names = ['user', 'admin'] as const;
    try {
      for (const name of names) {
        await this.prisma.role.upsert({
          where: { name },
          create: { name },
          update: {},
        });
      }
    } catch (e) {
      if (e instanceof Prisma.PrismaClientKnownRequestError) {
        if (e.code === 'P1000') {
          this.logger.error(
            'AUTH_DATABASE_URL rejected by PostgreSQL (wrong user/password). Use credentials that match your server. docker-compose postgres uses postgres/postgres on host port 5433 — see apps/auth-service/.env.example.',
          );
        }
        if (e.code === 'P1003') {
          this.logger.error(
            'Database in AUTH_DATABASE_URL does not exist. Create it (see docker/postgres/init), then run: pnpm run prisma:migrate:auth',
          );
        }
        if (e.code === 'P2021') {
          this.logger.error(
            'Tables are missing (migrations not applied). From the repo root run: pnpm run prisma:migrate:auth (requires apps/auth-service/.env with AUTH_DATABASE_URL).',
          );
        }
      }
      throw e;
    }
  }
}
