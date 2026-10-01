import { existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { config as loadEnv } from 'dotenv';
import { Prisma } from '../generated/prisma/client';
import { PrismaService } from './prisma.service';
import { loadDefaultOnboardingSteps } from './seed-onboarding-steps';

function loadAdminEnv() {
  const cwd = process.cwd();
  const envInCwd = resolve(cwd, '.env');
  const envInMonorepo = resolve(cwd, 'apps/admin-service/.env');

  if (existsSync(envInCwd)) {
    loadEnv({ path: envInCwd });
  }
  if (existsSync(envInMonorepo)) {
    loadEnv({ path: envInMonorepo, override: true });
  }
}

async function main() {
  loadAdminEnv();

  const databaseUrl = process.env.ADMIN_DATABASE_URL;
  if (!databaseUrl) {
    throw new Error('ADMIN_DATABASE_URL is required for admin seed');
  }

  const prisma = new PrismaService(databaseUrl);
  await prisma.onModuleInit();

  const flowName = process.env.ADMIN_SEED_FLOW_NAME ?? 'default-onboarding-flow';
  const flowVersion = Number(process.env.ADMIN_SEED_FLOW_VERSION ?? '1');
  const steps = loadDefaultOnboardingSteps();

  try {
    const flow = await prisma.onboardingFlow.upsert({
      where: {
        name_version: { name: flowName, version: flowVersion },
      },
      create: {
        name: flowName,
        version: flowVersion,
        status: 'PUBLISHED',
        isActive: true,
        publishedAt: new Date(),
      },
      update: {
        status: 'PUBLISHED',
        isActive: true,
        publishedAt: new Date(),
      },
    });

    await prisma.$transaction(async (tx) => {
      await tx.onboardingFlow.updateMany({
        where: { isActive: true, NOT: { id: flow.id } },
        data: { isActive: false },
      });

      await tx.onboardingStep.deleteMany({
        where: { flowId: flow.id },
      });

      for (const step of steps) {
        await tx.onboardingStep.create({
          data: {
            flowId: flow.id,
            orderIndex: step.orderIndex,
            title: step.title,
            subtitle: step.subtitle,
            uiConfig: step.uiConfig as Prisma.InputJsonValue,
          },
        });
      }
    });

    console.log('Admin onboarding seed complete');
    console.log(`Flow: ${flowName} v${flowVersion}`);
    console.log(`Steps: ${steps.length}`);
  } finally {
    await prisma.onModuleDestroy();
  }
}

main().catch((error) => {
  console.error('Admin seed failed:', error);
  process.exitCode = 1;
});
