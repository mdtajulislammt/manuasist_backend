import { BadRequestException, NotFoundException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  AppLaunchAssetKind,
  AppLaunchContentStatus,
  StoredFileNamespace,
  StorageProvider,
} from '../../generated/prisma/client';
import { FileStorageService } from '../file-storage/file-storage.service';
import { PrismaService } from '../prisma.service';
import { LaunchContentService } from './launch-content.service';

jest.mock('../../generated/prisma/client', () => ({
  PrismaClient: class { },
  AppLaunchAssetKind: {
    SPLASH: 'SPLASH',
    INTRO_SLIDE: 'INTRO_SLIDE',
  },
  AppLaunchContentStatus: {
    DRAFT: 'DRAFT',
    PUBLISHED: 'PUBLISHED',
    ARCHIVED: 'ARCHIVED',
  },
  StoredFileNamespace: {
    SPLASH: 'SPLASH',
    INTRO_IMAGE: 'INTRO_IMAGE',
  },
  StorageProvider: { LOCAL: 'LOCAL' },
  Prisma: {
    TransactionIsolationLevel: { Serializable: 'Serializable' },
    PrismaClientKnownRequestError: class extends Error { },
  },
}));

const splashFile = {
  id: 'splash-file',
  storedName: '11111111-1111-4111-8111-111111111111.png',
  namespace: StoredFileNamespace.SPLASH,
  provider: StorageProvider.LOCAL,
  contentType: 'image/png',
  sizeBytes: 100,
  objectKey: 'SPLASH/splash.png',
  displayName: 'splash',
  createdAt: new Date('2026-08-16T00:00:00.000Z'),
};

const introFile = {
  ...splashFile,
  id: 'intro-file',
  storedName: '22222222-2222-4222-8222-222222222222.webp',
  namespace: StoredFileNamespace.INTRO_IMAGE,
  contentType: 'image/webp',
};

function draftBundle(assets: Array<Record<string, unknown>> = []) {
  return {
    id: 'bundle-id',
    name: 'Default',
    status: AppLaunchContentStatus.DRAFT,
    isActive: false,
    publishedAt: null,
    createdAt: new Date('2026-08-16T00:00:00.000Z'),
    updatedAt: new Date('2026-08-16T00:00:00.000Z'),
    assets,
  };
}

function splashAsset() {
  return {
    id: 'splash-asset',
    bundleId: 'bundle-id',
    kind: AppLaunchAssetKind.SPLASH,
    orderIndex: 0,
    title: null,
    subtitle: null,
    storedFileId: splashFile.id,
    createdAt: splashFile.createdAt,
    updatedAt: splashFile.createdAt,
    storedFile: splashFile,
  };
}

function introAsset(orderIndex = 0) {
  return {
    id: `intro-asset-${orderIndex}`,
    bundleId: 'bundle-id',
    kind: AppLaunchAssetKind.INTRO_SLIDE,
    orderIndex,
    title: `Title ${orderIndex}`,
    subtitle: `Subtitle ${orderIndex}`,
    storedFileId: introFile.id,
    createdAt: introFile.createdAt,
    updatedAt: introFile.createdAt,
    storedFile: introFile,
  };
}

describe('LaunchContentService', () => {
  const tx = {
    appLaunchContentBundle: {
      updateMany: jest.fn(),
      update: jest.fn(),
    },
    appLaunchAsset: { update: jest.fn() },
  };
  const prisma = {
    appLaunchContentBundle: {
      findFirst: jest.fn(),
      findUnique: jest.fn(),
      findMany: jest.fn(),
      create: jest.fn(),
      update: jest.fn(),
      delete: jest.fn(),
    },
    appLaunchAsset: {
      findFirst: jest.fn(),
      create: jest.fn(),
      update: jest.fn(),
      delete: jest.fn(),
    },
    $transaction: jest.fn((callback: (client: typeof tx) => unknown) =>
      Promise.resolve(callback(tx)),
    ),
  };
  const files = {
    storeNew: jest.fn(),
    deleteById: jest.fn(),
    buildPublicUrl: jest.fn(
      (namespace: StoredFileNamespace, storedName: string) =>
        `/files/${namespace.toLowerCase().replace('_', '-')}/${storedName}`,
    ),
    getStream: jest.fn(),
  };
  const config = {
    get: jest.fn(() => 'https://api.example.com/v1/admin'),
  };
  const service = new LaunchContentService(
    prisma as unknown as PrismaService,
    files as unknown as FileStorageService,
    config as unknown as ConfigService,
  );

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('returns only the active published bundle with ordered slides', async () => {
    prisma.appLaunchContentBundle.findFirst.mockResolvedValue({
      ...draftBundle([introAsset(1), splashAsset(), introAsset(0)]),
      status: AppLaunchContentStatus.PUBLISHED,
      isActive: true,
    });

    const result = await service.getActiveBundle();

    expect(prisma.appLaunchContentBundle.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          status: AppLaunchContentStatus.PUBLISHED,
          isActive: true,
        },
      }),
    );
    expect(result.splash?.imageUrl).toBe(
      'https://api.example.com/v1/admin/branding/splash?v=1786838400000',
    );
    expect(result.introSlides.map((slide) => slide.orderIndex)).toEqual([0, 1]);
  });

  it('does not expose content when there is no active published bundle', async () => {
    prisma.appLaunchContentBundle.findFirst.mockResolvedValue(null);

    await expect(service.getActiveBundle()).rejects.toBeInstanceOf(
      NotFoundException,
    );
  });

  it('does not allow published content to be edited', async () => {
    prisma.appLaunchContentBundle.findUnique.mockResolvedValue({
      ...draftBundle(),
      status: AppLaunchContentStatus.PUBLISHED,
      isActive: true,
    });

    await expect(
      service.updateBundle('bundle-id', { name: 'Changed' }),
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(prisma.appLaunchContentBundle.update).not.toHaveBeenCalled();
  });

  it('publishes a complete draft and archives the previous active bundle', async () => {
    const completeDraft = draftBundle([splashAsset(), introAsset()]);
    prisma.appLaunchContentBundle.findUnique
      .mockResolvedValueOnce(completeDraft)
      .mockResolvedValueOnce({
        ...completeDraft,
        status: AppLaunchContentStatus.PUBLISHED,
        isActive: true,
      });

    await service.publishBundle('bundle-id');

    expect(tx.appLaunchContentBundle.updateMany).toHaveBeenCalledWith({
      where: { isActive: true, id: { not: 'bundle-id' } },
      data: {
        isActive: false,
        status: AppLaunchContentStatus.ARCHIVED,
      },
    });
    expect(tx.appLaunchContentBundle.update).toHaveBeenCalledTimes(1);
  });

  it('rejects publishing incomplete or unordered content', async () => {
    prisma.appLaunchContentBundle.findUnique.mockResolvedValue(
      draftBundle([introAsset(1)]),
    );

    await expect(service.publishBundle('bundle-id')).rejects.toBeInstanceOf(
      BadRequestException,
    );
    expect(prisma.$transaction).not.toHaveBeenCalled();
  });

  it('replaces an image and cleans up the previous stored file', async () => {
    const asset = introAsset();
    prisma.appLaunchContentBundle.findUnique
      .mockResolvedValueOnce(draftBundle([asset]))
      .mockResolvedValueOnce(draftBundle([asset]));
    prisma.appLaunchAsset.findFirst.mockResolvedValue(asset);
    files.storeNew.mockResolvedValue({ ...introFile, id: 'replacement-file' });
    prisma.appLaunchAsset.update.mockResolvedValue(asset);
    files.deleteById.mockResolvedValue({ deleted: true });

    await service.updateAsset(
      'bundle-id',
      asset.id,
      { title: 'Updated title' },
      {
        buffer: Buffer.from('replacement'),
        originalname: 'replacement.webp',
        mimetype: 'image/webp',
        size: 11,
      },
    );

    expect(prisma.appLaunchAsset.update).toHaveBeenCalledTimes(1);
    expect(files.deleteById).toHaveBeenCalledWith(introFile.id);
  });

  it('requires a complete contiguous slide set when reordering', async () => {
    const slides = [introAsset(0), introAsset(1)];
    prisma.appLaunchContentBundle.findUnique.mockResolvedValue(
      draftBundle(slides),
    );

    await expect(
      service.reorderSlides('bundle-id', {
        assets: [{ id: slides[0].id, orderIndex: 0 }],
      }),
    ).rejects.toBeInstanceOf(BadRequestException);
  });
});
