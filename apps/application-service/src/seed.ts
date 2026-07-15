import { existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { config as loadEnv } from 'dotenv';
import { Pool } from 'pg';
import { EntitlementStatus } from '../generated/prisma/client';
import { PrismaService } from './prisma.service';

function loadApplicationEnv() {
  const cwd = process.cwd();
  const envInCwd = resolve(cwd, '.env');
  const envInMonorepo = resolve(cwd, 'apps/application-service/.env');
  const authEnvInMonorepo = resolve(cwd, 'apps/auth-service/.env');

  if (existsSync(envInCwd)) {
    loadEnv({ path: envInCwd });
  }
  if (existsSync(envInMonorepo)) {
    loadEnv({ path: envInMonorepo, override: true });
  }
  // Premium email / auth DB URL may live in auth-service/.env
  if (existsSync(authEnvInMonorepo)) {
    loadEnv({ path: authEnvInMonorepo, override: false });
  }
}

async function resolvePremiumUserId(): Promise<{
  userId: string;
  email: string;
}> {
  const explicitId = process.env.AUTH_SEED_PREMIUM_USER_ID?.trim();
  const premiumEmail = (
    process.env.AUTH_SEED_PREMIUM_EMAIL ?? 'premium@menuassist.local'
  )
    .trim()
    .toLowerCase();

  if (explicitId) {
    return { userId: explicitId, email: premiumEmail };
  }

  const authDatabaseUrl = process.env.AUTH_DATABASE_URL;
  if (!authDatabaseUrl) {
    throw new Error(
      'AUTH_DATABASE_URL or AUTH_SEED_PREMIUM_USER_ID is required to resolve the premium seed user',
    );
  }

  const pool = new Pool({ connectionString: authDatabaseUrl });
  try {
    const result = await pool.query<{ id: string; email: string | null }>(
      `SELECT id, email FROM auth_users WHERE lower(email) = $1 LIMIT 1`,
      [premiumEmail],
    );
    const row = result.rows[0];
    if (!row?.id) {
      throw new Error(
        `Premium auth user not found for email ${premiumEmail}. Run pnpm run seed:auth first.`,
      );
    }
    return { userId: row.id, email: row.email ?? premiumEmail };
  } finally {
    await pool.end();
  }
}

async function main() {
  loadApplicationEnv();

  const databaseUrl = process.env.APPLICATION_DATABASE_URL;
  if (!databaseUrl) {
    throw new Error('APPLICATION_DATABASE_URL is required for application seed');
  }

  const { userId, email } = await resolvePremiumUserId();

  const entitlementKey =
    process.env.REVENUECAT_ENTITLEMENT_ID?.trim() || 'premium';
  const productId =
    process.env.AUTH_SEED_PREMIUM_PRODUCT_ID?.trim() ||
    'menu_assist_premium_monthly';
  const billingPeriodLabel =
    process.env.MEMBERSHIP_BILLING_PERIOD_LABEL?.trim() || 'Per Month';
  const priceLabel = process.env.MEMBERSHIP_PRICE_LABEL?.trim() || '$2.99';

  const now = new Date();
  const expiresAt = new Date(now);
  expiresAt.setUTCDate(expiresAt.getUTCDate() + 30);

  const prisma = new PrismaService(databaseUrl);
  await prisma.onModuleInit();

  try {
    const entitlement = await prisma.userEntitlement.upsert({
      where: {
        userId_entitlementKey: { userId, entitlementKey },
      },
      create: {
        userId,
        revenueCatAppUserId: userId,
        entitlementKey,
        status: EntitlementStatus.ACTIVE,
        productId,
        periodType: 'NORMAL',
        planKey: 'premium_monthly',
        priceLabel,
        billingPeriodLabel,
        expiresAt,
        willRenew: true,
        latestEventAt: now,
      },
      update: {
        revenueCatAppUserId: userId,
        status: EntitlementStatus.ACTIVE,
        productId,
        periodType: 'NORMAL',
        planKey: 'premium_monthly',
        priceLabel,
        billingPeriodLabel,
        expiresAt,
        willRenew: true,
        latestEventAt: now,
      },
    });

    console.log('Application entitlement seed complete');
    console.log(`Premium user: ${email} (${userId})`);
    console.log(
      `Entitlement: ${entitlement.entitlementKey} ${entitlement.status} until ${expiresAt.toISOString()}`,
    );
  } finally {
    await prisma.onModuleDestroy();
  }
}

main().catch((error) => {
  console.error('Application seed failed:', error);
  process.exitCode = 1;
});
