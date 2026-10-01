import { existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { config as loadEnv } from 'dotenv';
import { hash } from 'bcrypt';
import { UserStatus } from '../generated/prisma/client';
import { PrismaService } from './prisma.service';

const DEFAULT_STAFF_ADMIN_EMAILS = [
  'dgoman@menuassistapp.com',
  'audrey.gabriella@menuassistapp.com',
  'andrei@abalan.ro',
];

function loadAuthEnv() {
  const cwd = process.cwd();
  const envInCwd = resolve(cwd, '.env');
  const envInMonorepo = resolve(cwd, 'apps/auth-service/.env');

  if (existsSync(envInCwd)) {
    loadEnv({ path: envInCwd });
  }
  if (existsSync(envInMonorepo)) {
    loadEnv({ path: envInMonorepo, override: true });
  }
}

function staffAdminEmails(): string[] {
  const fromEnv = process.env.AUTH_SEED_STAFF_ADMIN_EMAILS;
  if (!fromEnv?.trim()) {
    return DEFAULT_STAFF_ADMIN_EMAILS;
  }
  return fromEnv
    .split(',')
    .map((email) => email.trim().toLowerCase())
    .filter(Boolean);
}

async function ensureAdminUser(
  prisma: PrismaService,
  email: string,
  passwordHash: string,
  userRoleId: string,
  adminRoleId: string,
) {
  const user = await prisma.authUser.upsert({
    where: { email },
    create: {
      email,
      passwordHash,
      emailVerifiedAt: new Date(),
    },
    update: {
      passwordHash,
      emailVerifiedAt: new Date(),
      status: UserStatus.ACTIVE,
    },
  });

  await prisma.userRole.upsert({
    where: { userId_roleId: { userId: user.id, roleId: userRoleId } },
    create: { userId: user.id, roleId: userRoleId },
    update: {},
  });
  await prisma.userRole.upsert({
    where: { userId_roleId: { userId: user.id, roleId: adminRoleId } },
    create: { userId: user.id, roleId: adminRoleId },
    update: {},
  });

  return user;
}

async function main() {
  loadAuthEnv();

  const databaseUrl = process.env.AUTH_DATABASE_URL;
  if (!databaseUrl) {
    throw new Error('AUTH_DATABASE_URL is required for admin seed');
  }

  const password = process.env.AUTH_SEED_STAFF_ADMIN_PASSWORD ?? 'Admin@##2600';
  const emails = staffAdminEmails();
  const prisma = new PrismaService(databaseUrl);
  await prisma.onModuleInit();

  try {
    const userRole = await prisma.role.upsert({
      where: { name: 'user' },
      create: { name: 'user' },
      update: {},
    });
    const adminRole = await prisma.role.upsert({
      where: { name: 'admin' },
      create: { name: 'admin' },
      update: {},
    });

    const passwordHash = await hash(password, 12);

    console.log('Seeding staff admin accounts...');
    for (const email of emails) {
      const user = await ensureAdminUser(
        prisma,
        email,
        passwordHash,
        userRole.id,
        adminRole.id,
      );
      console.log(`Admin: ${email} (${user.id})`);
    }
    console.log('Staff admin seed complete');
    console.log(`Shared password: ${password}`);
  } finally {
    await prisma.onModuleDestroy();
  }
}

main().catch((error) => {
  console.error('Staff admin seed failed:', error);
  process.exitCode = 1;
});
