import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs';
import { extname, join, resolve } from 'node:path';
import { config as loadEnv } from 'dotenv';
import {
  StorageProvider,
  StoredFileNamespace,
} from '../generated/prisma/enums';
import { PrismaService } from './prisma.service';

const UUID_FILE_RE =
  /^([0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12})(\.[a-z0-9]+)$/i;

const MIME: Record<string, string> = {
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.gif': 'image/gif',
  '.webp': 'image/webp',
  '.svg': 'image/svg+xml',
};

function loadAdminEnv() {
  const cwd = process.cwd();
  for (const p of [resolve(cwd, '.env'), resolve(cwd, 'apps/admin-service/.env')]) {
    if (existsSync(p)) {
      loadEnv({ path: p, override: true });
    }
  }
}

async function main() {
  loadAdminEnv();
  const databaseUrl = process.env.ADMIN_DATABASE_URL;
  if (!databaseUrl) {
    throw new Error('ADMIN_DATABASE_URL is required');
  }

  const prisma = new PrismaService(databaseUrl);
  await prisma.onModuleInit();

  const localRoot = process.env.FILE_STORAGE_LOCAL_ROOT ?? 'uploads';
  const dir = join(process.cwd(), localRoot, 'onboarding-icons');
  if (!existsSync(dir)) {
    console.log('No legacy onboarding-icons directory; nothing to backfill.');
    await prisma.$disconnect();
    return;
  }

  const names = readdirSync(dir).filter((n) => UUID_FILE_RE.test(n));
  let created = 0;
  let skipped = 0;

  for (const storedName of names) {
    const existing = await prisma.storedFile.findFirst({
      where: {
        namespace: StoredFileNamespace.ONBOARDING_ICON,
        storedName,
      },
    });
    if (existing) {
      skipped++;
      continue;
    }

    const full = join(dir, storedName);
    const { size } = statSync(full);
    const ext = extname(storedName).toLowerCase();
    const contentType = MIME[ext] ?? 'application/octet-stream';

    let displayName: string | null = null;
    const metaPath = `${full}.meta.json`;
    if (existsSync(metaPath)) {
      try {
        const parsed = JSON.parse(readFileSync(metaPath, 'utf8')) as {
          iconName?: unknown;
        };
        if (typeof parsed.iconName === 'string' && parsed.iconName.trim()) {
          displayName = parsed.iconName.trim();
        }
      } catch {
        /* ignore */
      }
    }

    await prisma.storedFile.create({
      data: {
        storedName,
        namespace: StoredFileNamespace.ONBOARDING_ICON,
        provider: StorageProvider.LOCAL,
        contentType,
        sizeBytes: size,
        objectKey: `${StoredFileNamespace.ONBOARDING_ICON}/${storedName}`,
        displayName,
      },
    });
    created++;
  }

  console.log(`Backfill complete: ${created} created, ${skipped} skipped.`);
  await prisma.$disconnect();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
