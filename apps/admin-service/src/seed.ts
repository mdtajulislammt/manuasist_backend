import { existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { config as loadEnv } from 'dotenv';
import { PrismaService } from './prisma.service';

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

  const steps = [
    {
      orderIndex: 1,
      type: 'GOAL',
      title: 'Set your primary goal',
      subtitle: 'Weight loss, maintenance, or muscle gain',
      uiConfig: { kind: 'single_select', options: ['lose', 'maintain', 'gain'] },
    },
    {
      orderIndex: 2,
      type: 'DIET',
      title: 'Choose dietary preferences',
      subtitle: 'We will tailor recommendations to your diet',
      uiConfig: {
        kind: 'multi_select',
        options: ['vegetarian', 'vegan', 'halal', 'keto', 'none'],
      },
    },
    {
      orderIndex: 3,
      type: 'ALLERGIES',
      title: 'Tell us your allergies',
      subtitle: 'Select all that apply',
      uiConfig: {
        kind: 'multi_select',
        options: ['nuts', 'dairy', 'eggs', 'gluten', 'shellfish', 'none'],
      },
    },
    {
      orderIndex: 4,
      type: 'SUMMARY',
      title: 'Review and continue',
      subtitle: 'Confirm your onboarding selections',
      uiConfig: { kind: 'summary' },
    },
  ] as const;

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
            type: step.type,
            title: step.title,
            subtitle: step.subtitle,
            uiConfig: step.uiConfig,
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
