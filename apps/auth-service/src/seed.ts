import { existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { config as loadEnv } from 'dotenv';
import { hash } from 'bcrypt';
import { PrismaService } from './prisma.service';

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

async function main() {
  loadAuthEnv();

  const databaseUrl = process.env.AUTH_DATABASE_URL;
  if (!databaseUrl) {
    throw new Error('AUTH_DATABASE_URL is required for auth seed');
  }

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

    const adminEmail = (
      process.env.AUTH_SEED_ADMIN_EMAIL ?? 'admin@menuassist.local'
    )
      .trim()
      .toLowerCase();
    const adminPassword = process.env.AUTH_SEED_ADMIN_PASSWORD ?? 'Admin@123456';

    const userEmail = (
      process.env.AUTH_SEED_USER_EMAIL ?? 'user@menuassist.local'
    )
      .trim()
      .toLowerCase();
    const userPassword = process.env.AUTH_SEED_USER_PASSWORD ?? 'User@123456';

    const [adminPasswordHash, userPasswordHash] = await Promise.all([
      hash(adminPassword, 12),
      hash(userPassword, 12),
    ]);

    const adminUser = await prisma.authUser.upsert({
      where: { email: adminEmail },
      create: {
        email: adminEmail,
        passwordHash: adminPasswordHash,
        emailVerifiedAt: new Date(),
      },
      update: {
        passwordHash: adminPasswordHash,
        emailVerifiedAt: new Date(),
      },
    });

    const standardUser = await prisma.authUser.upsert({
      where: { email: userEmail },
      create: {
        email: userEmail,
        passwordHash: userPasswordHash,
        emailVerifiedAt: new Date(),
      },
      update: {
        passwordHash: userPasswordHash,
        emailVerifiedAt: new Date(),
      },
    });

    await prisma.userRole.upsert({
      where: {
        userId_roleId: { userId: adminUser.id, roleId: userRole.id },
      },
      create: { userId: adminUser.id, roleId: userRole.id },
      update: {},
    });
    await prisma.userRole.upsert({
      where: {
        userId_roleId: { userId: adminUser.id, roleId: adminRole.id },
      },
      create: { userId: adminUser.id, roleId: adminRole.id },
      update: {},
    });
    await prisma.userRole.upsert({
      where: {
        userId_roleId: { userId: standardUser.id, roleId: userRole.id },
      },
      create: { userId: standardUser.id, roleId: userRole.id },
      update: {},
    });

    console.log('Auth seed complete');
    console.log(`Admin: ${adminEmail}`);
    console.log(`User: ${userEmail}`);
  } finally {
    await prisma.onModuleDestroy();
  }
}

main().catch((error) => {
  console.error('Auth seed failed:', error);
  process.exitCode = 1;
});
