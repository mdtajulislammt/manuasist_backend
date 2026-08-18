import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  AppLaunchAssetKind,
  AppLaunchContentStatus,
  Prisma,
  StoredFileNamespace,
} from '../../generated/prisma/client';
import {
  FileStorageService,
  type FileUploadInput,
} from '../file-storage/file-storage.service';
import { PrismaService } from '../prisma.service';
import { CreateLaunchContentDto } from './dto/create-launch-content.dto';
import {
  CreateLaunchContentAssetDto,
  UpdateLaunchContentAssetDto,
} from './dto/launch-content-asset.dto';
import { ReorderLaunchContentAssetsDto } from './dto/reorder-launch-content-assets.dto';
import { UpdateLaunchContentDto } from './dto/update-launch-content.dto';

const bundleInclude = {
  assets: {
    include: { storedFile: true },
    orderBy: [{ kind: 'asc' }, { orderIndex: 'asc' }],
  },
} satisfies Prisma.AppLaunchContentBundleInclude;

const bundleListInclude = {
  _count: {
    select: {
      assets: { where: { kind: AppLaunchAssetKind.INTRO_SLIDE } },
    },
  },
} satisfies Prisma.AppLaunchContentBundleInclude;

type LaunchBundleWithAssets = Prisma.AppLaunchContentBundleGetPayload<{
  include: typeof bundleInclude;
}>;

@Injectable()
export class LaunchContentService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly files: FileStorageService,
    private readonly config: ConfigService,
  ) {}

  async createBundle(dto: CreateLaunchContentDto) {
    const bundle = await this.prisma.appLaunchContentBundle.create({
      data: { name: dto.name.trim() },
      include: bundleInclude,
    });
    return this.toBundleDto(bundle, false);
  }

  async listBundles() {
    const bundles = await this.prisma.appLaunchContentBundle.findMany({
      orderBy: [{ createdAt: 'desc' }],
      include: bundleListInclude,
    });
    return bundles.map((bundle) => ({
      id: bundle.id,
      name: bundle.name,
      status: bundle.status,
      isActive: bundle.isActive,
      publishedAt: bundle.publishedAt,
      createdAt: bundle.createdAt,
      updatedAt: bundle.updatedAt,
      introSlideCount: bundle._count.assets,
    }));
  }

  async getBundle(id: string) {
    return this.toBundleDto(await this.requireBundle(id), false);
  }

  async updateBundle(id: string, dto: UpdateLaunchContentDto) {
    const existing = await this.requireDraftBundle(id);
    if (dto.name === undefined) {
      return this.toBundleDto(existing, false);
    }

    const updated = await this.prisma.appLaunchContentBundle.update({
      where: { id },
      data: { name: dto.name.trim() },
      include: bundleInclude,
    });
    return this.toBundleDto(updated, false);
  }

  async deleteBundle(id: string) {
    const bundle = await this.requireDraftBundle(id);
    const storedFileIds = bundle.assets.map((asset) => asset.storedFileId);
    await this.prisma.appLaunchContentBundle.delete({ where: { id } });
    await Promise.allSettled(
      storedFileIds.map((storedFileId) => this.files.deleteById(storedFileId)),
    );
    return { deleted: true as const, id };
  }

  async addAsset(
    bundleId: string,
    dto: CreateLaunchContentAssetDto,
    file: FileUploadInput,
  ) {
    const bundle = await this.requireDraftBundle(bundleId);
    const orderIndex =
      dto.kind === AppLaunchAssetKind.SPLASH
        ? 0
        : (dto.orderIndex ??
          bundle.assets.filter(
            (asset) => asset.kind === AppLaunchAssetKind.INTRO_SLIDE,
          ).length);

    if (
      dto.kind === AppLaunchAssetKind.SPLASH &&
      bundle.assets.some((asset) => asset.kind === AppLaunchAssetKind.SPLASH)
    ) {
      throw new BadRequestException(
        'This draft already has a splash image; replace the existing splash asset instead',
      );
    }

    const namespace = this.namespaceForKind(dto.kind);
    const stored = await this.files.storeNew(
      namespace,
      file,
      `${dto.kind.toLowerCase()}-${orderIndex}`,
    );
    try {
      await this.prisma.appLaunchAsset.create({
        data: {
          bundleId,
          kind: dto.kind,
          orderIndex,
          title: this.nullableText(dto.title),
          subtitle: this.nullableText(dto.subtitle),
          storedFileId: stored.id,
        },
      });
    } catch (error) {
      await Promise.allSettled([this.files.deleteById(stored.id)]);
      this.rethrowKnownConstraint(
        error,
        'An asset already uses this type and order',
      );
    }

    return this.getBundle(bundleId);
  }

  async updateAsset(
    bundleId: string,
    assetId: string,
    dto: UpdateLaunchContentAssetDto,
    file?: FileUploadInput,
  ) {
    await this.requireDraftBundle(bundleId);
    const asset = await this.requireAsset(bundleId, assetId);
    const nextOrder =
      asset.kind === AppLaunchAssetKind.SPLASH
        ? 0
        : (dto.orderIndex ?? asset.orderIndex);
    let replacementId: string | undefined;

    if (file) {
      const replacement = await this.files.storeNew(
        this.namespaceForKind(asset.kind),
        file,
        `${asset.kind.toLowerCase()}-${nextOrder}`,
      );
      replacementId = replacement.id;
    }

    try {
      await this.prisma.appLaunchAsset.update({
        where: { id: assetId },
        data: {
          orderIndex: nextOrder,
          ...(dto.title === undefined
            ? {}
            : { title: this.nullableText(dto.title) }),
          ...(dto.subtitle === undefined
            ? {}
            : { subtitle: this.nullableText(dto.subtitle) }),
          ...(replacementId ? { storedFileId: replacementId } : {}),
        },
      });
    } catch (error) {
      if (replacementId) {
        await Promise.allSettled([this.files.deleteById(replacementId)]);
      }
      this.rethrowKnownConstraint(
        error,
        'An asset already uses this type and order',
      );
    }

    if (replacementId) {
      await Promise.allSettled([this.files.deleteById(asset.storedFileId)]);
    }
    return this.getBundle(bundleId);
  }

  async deleteAsset(bundleId: string, assetId: string) {
    await this.requireDraftBundle(bundleId);
    const asset = await this.requireAsset(bundleId, assetId);
    await this.prisma.appLaunchAsset.delete({ where: { id: assetId } });
    await Promise.allSettled([this.files.deleteById(asset.storedFileId)]);
    return this.getBundle(bundleId);
  }

  async reorderSlides(bundleId: string, dto: ReorderLaunchContentAssetsDto) {
    const bundle = await this.requireDraftBundle(bundleId);
    const slides = bundle.assets.filter(
      (asset) => asset.kind === AppLaunchAssetKind.INTRO_SLIDE,
    );
    const expectedIds = new Set(slides.map((slide) => slide.id));
    const receivedIds = new Set(dto.assets.map((asset) => asset.id));
    const receivedOrders = dto.assets
      .map((asset) => asset.orderIndex)
      .sort((a, b) => a - b);

    if (
      receivedIds.size !== expectedIds.size ||
      [...expectedIds].some((id) => !receivedIds.has(id)) ||
      receivedOrders.some((order, index) => order !== index)
    ) {
      throw new BadRequestException(
        'Reorder must include every intro slide exactly once with contiguous order values starting at 0',
      );
    }

    await this.prisma.$transaction(async (tx) => {
      for (const [index, item] of dto.assets.entries()) {
        await tx.appLaunchAsset.update({
          where: { id: item.id },
          data: { orderIndex: -100000 - index },
        });
      }
      for (const item of dto.assets) {
        await tx.appLaunchAsset.update({
          where: { id: item.id },
          data: { orderIndex: item.orderIndex },
        });
      }
    });

    return this.getBundle(bundleId);
  }

  async publishBundle(bundleId: string) {
    const bundle = await this.requireDraftBundle(bundleId);
    this.assertPublishable(bundle);

    await this.prisma.$transaction(
      async (tx) => {
        await tx.appLaunchContentBundle.updateMany({
          where: { isActive: true, id: { not: bundleId } },
          data: {
            isActive: false,
            status: AppLaunchContentStatus.ARCHIVED,
          },
        });
        await tx.appLaunchContentBundle.update({
          where: { id: bundleId },
          data: {
            status: AppLaunchContentStatus.PUBLISHED,
            isActive: true,
            publishedAt: new Date(),
          },
        });
      },
      { isolationLevel: Prisma.TransactionIsolationLevel.Serializable },
    );

    return this.getBundle(bundleId);
  }

  async getActiveBundle() {
    const bundle = await this.prisma.appLaunchContentBundle.findFirst({
      where: {
        status: AppLaunchContentStatus.PUBLISHED,
        isActive: true,
      },
      include: bundleInclude,
    });
    if (!bundle) {
      throw new NotFoundException('No active launch content');
    }
    return this.toBundleDto(bundle, true);
  }

  async getPublishedSplashStream() {
    const bundle = await this.prisma.appLaunchContentBundle.findFirst({
      where: {
        status: AppLaunchContentStatus.PUBLISHED,
        isActive: true,
      },
      include: {
        assets: {
          where: { kind: AppLaunchAssetKind.SPLASH },
          include: { storedFile: true },
          take: 1,
        },
      },
    });
    const splash = bundle?.assets[0];
    if (!splash) {
      throw new NotFoundException('No published splash image');
    }
    return this.files.getStream(
      splash.storedFile.namespace,
      splash.storedFile.storedName,
    );
  }

  private async requireBundle(id: string): Promise<LaunchBundleWithAssets> {
    const bundle = await this.prisma.appLaunchContentBundle.findUnique({
      where: { id },
      include: bundleInclude,
    });
    if (!bundle) {
      throw new NotFoundException('Launch content bundle not found');
    }
    return bundle;
  }

  private async requireDraftBundle(
    id: string,
  ): Promise<LaunchBundleWithAssets> {
    const bundle = await this.requireBundle(id);
    if (bundle.status !== AppLaunchContentStatus.DRAFT) {
      throw new BadRequestException(
        'Only draft launch content can be modified',
      );
    }
    return bundle;
  }

  private async requireAsset(bundleId: string, assetId: string) {
    const asset = await this.prisma.appLaunchAsset.findFirst({
      where: { id: assetId, bundleId },
      include: { storedFile: true },
    });
    if (!asset) {
      throw new NotFoundException('Launch content asset not found');
    }
    return asset;
  }

  private assertPublishable(bundle: LaunchBundleWithAssets) {
    const splashCount = bundle.assets.filter(
      (asset) => asset.kind === AppLaunchAssetKind.SPLASH,
    ).length;
    const slides = bundle.assets
      .filter((asset) => asset.kind === AppLaunchAssetKind.INTRO_SLIDE)
      .sort((left, right) => left.orderIndex - right.orderIndex);

    if (splashCount !== 1) {
      throw new BadRequestException(
        'A bundle must contain exactly one splash image',
      );
    }
    if (slides.length === 0) {
      throw new BadRequestException(
        'A bundle must contain at least one intro slide',
      );
    }
    if (
      slides.some(
        (slide, index) =>
          slide.orderIndex !== index ||
          !slide.title?.trim() ||
          !slide.subtitle?.trim(),
      )
    ) {
      throw new BadRequestException(
        'Intro slides require title, subtitle, and contiguous order values starting at 0',
      );
    }
  }

  private toBundleDto(
    bundle: LaunchBundleWithAssets,
    useStableSplashUrl: boolean,
  ) {
    const assets = bundle.assets.map((asset) => ({
      id: asset.id,
      kind: asset.kind,
      orderIndex: asset.orderIndex,
      title: asset.title,
      subtitle: asset.subtitle,
      imageUrl:
        useStableSplashUrl && asset.kind === AppLaunchAssetKind.SPLASH
          ? this.absoluteUrl(`/branding/splash?v=${bundle.updatedAt.getTime()}`)
          : this.absoluteUrl(
              this.files.buildPublicUrl(
                asset.storedFile.namespace,
                asset.storedFile.storedName,
              ),
            ),
      contentType: asset.storedFile.contentType,
      sizeBytes: asset.storedFile.sizeBytes,
      updatedAt: asset.updatedAt,
    }));
    return {
      id: bundle.id,
      name: bundle.name,
      status: bundle.status,
      isActive: bundle.isActive,
      publishedAt: bundle.publishedAt,
      createdAt: bundle.createdAt,
      updatedAt: bundle.updatedAt,
      splash:
        assets.find((asset) => asset.kind === AppLaunchAssetKind.SPLASH) ??
        null,
      introSlides: assets
        .filter((asset) => asset.kind === AppLaunchAssetKind.INTRO_SLIDE)
        .sort((left, right) => left.orderIndex - right.orderIndex),
    };
  }

  private namespaceForKind(kind: AppLaunchAssetKind): StoredFileNamespace {
    return kind === AppLaunchAssetKind.SPLASH
      ? StoredFileNamespace.SPLASH
      : StoredFileNamespace.INTRO_IMAGE;
  }

  private absoluteUrl(path: string): string {
    const baseUrl = (
      this.config.get<string>('FILE_STORAGE_PUBLIC_URL') ?? ''
    ).replace(/\/+$/, '');
    return `${baseUrl}${path}`;
  }

  private nullableText(value?: string): string | null {
    const normalized = value?.trim();
    return normalized ? normalized : null;
  }

  private rethrowKnownConstraint(error: unknown, message: string): never {
    if (
      error instanceof Prisma.PrismaClientKnownRequestError &&
      error.code === 'P2002'
    ) {
      throw new BadRequestException(message);
    }
    throw error;
  }
}
