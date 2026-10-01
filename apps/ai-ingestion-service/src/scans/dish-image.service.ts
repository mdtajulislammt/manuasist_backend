import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  type ExtractedDishLine,
  ImageGenerationClient,
  SpoonacularClient,
} from '../../../../libs/ai-pipeline/src';
import { DishImageSource } from '../../generated/prisma/enums';
import { AdminFileClientService } from '../clients/admin-file-client.service';
import { PrismaService } from '../prisma.service';
import {
  buildDishImagePrompt,
  dishImageFingerprint,
} from './dish-image.util';

const DEFAULT_FALLBACK_CACHE_HOURS = 24;

@Injectable()
export class DishImageService {
  private readonly logger = new Logger(DishImageService.name);
  private readonly generator: ImageGenerationClient;
  private readonly fallback: SpoonacularClient;
  private readonly fallbackCacheMs: number;
  private readonly inFlight = new Map<string, Promise<string>>();

  constructor(
    private readonly prisma: PrismaService,
    private readonly config: ConfigService,
    private readonly adminFiles: AdminFileClientService,
  ) {
    this.generator = new ImageGenerationClient({
      apiKey: config.get<string>('OPENAI_API_KEY'),
      baseUrl: config.get<string>('OPENAI_BASE_URL'),
      model: config.get<string>('OPENAI_IMAGE_MODEL'),
      size: config.get<string>('OPENAI_IMAGE_SIZE'),
      quality: config.get<string>('OPENAI_IMAGE_QUALITY'),
      timeoutMs: this.positiveNumber(
        config.get<string>('OPENAI_IMAGE_TIMEOUT_MS'),
        120_000,
      ),
    });
    this.fallback = new SpoonacularClient(
      config.get<string>('SPOONACULAR_API_KEY'),
    );
    this.fallbackCacheMs =
      this.positiveNumber(
        config.get<string>('DISH_IMAGE_FALLBACK_CACHE_HOURS'),
        DEFAULT_FALLBACK_CACHE_HOURS,
      ) *
      60 *
      60 *
      1000;
  }

  async getDishImage(dish: ExtractedDishLine): Promise<string> {
    const fingerprint = dishImageFingerprint(dish);
    const cached = await this.prisma.dishImageCache.findUnique({
      where: { fingerprint },
    });
    if (cached && this.isCacheUsable(cached.expiresAt)) {
      return cached.imageUrl;
    }

    const active = this.inFlight.get(fingerprint);
    if (active) {
      return active;
    }

    const work = this.generateOrFallback(dish, fingerprint).finally(() => {
      this.inFlight.delete(fingerprint);
    });
    this.inFlight.set(fingerprint, work);
    return work;
  }

  private async generateOrFallback(
    dish: ExtractedDishLine,
    fingerprint: string,
  ): Promise<string> {
    const prompt = buildDishImagePrompt(dish);

    if (this.generator.isConfigured()) {
      try {
        const generated = await this.generator.generate(prompt);
        const stored = await this.adminFiles.uploadDishImage({
          buffer: generated.buffer,
          contentType: generated.contentType,
          displayName: `dish-${fingerprint.slice(0, 24)}`,
        });
        const imageUrl = this.adminFiles.buildPublicDishImageUrl(
          stored.storedName,
        );
        await this.prisma.dishImageCache.upsert({
          where: { fingerprint },
          create: {
            fingerprint,
            dishName: dish.name,
            description: dish.description ?? null,
            imageUrl,
            storedFileName: stored.storedName,
            source: DishImageSource.AI_GENERATED,
            prompt,
            model: generated.model,
          },
          update: {
            dishName: dish.name,
            description: dish.description ?? null,
            imageUrl,
            storedFileName: stored.storedName,
            source: DishImageSource.AI_GENERATED,
            prompt,
            model: generated.model,
            expiresAt: null,
          },
        });
        return imageUrl;
      } catch (error) {
        this.logger.warn(
          `AI dish image failed for "${dish.name}"; using temporary fallback: ${
            error instanceof Error ? error.message : String(error)
          }`,
        );
      }
    } else {
      this.logger.warn(
        'OPENAI_API_KEY missing; dish images use temporary external fallbacks',
      );
    }

    const imageUrl = await this.fallback.getDishImage(dish.name);
    const expiresAt = new Date(Date.now() + this.fallbackCacheMs);
    await this.prisma.dishImageCache.upsert({
      where: { fingerprint },
      create: {
        fingerprint,
        dishName: dish.name,
        description: dish.description ?? null,
        imageUrl,
        source: DishImageSource.EXTERNAL_FALLBACK,
        prompt,
        model: this.generator.getModel(),
        expiresAt,
      },
      update: {
        dishName: dish.name,
        description: dish.description ?? null,
        imageUrl,
        storedFileName: null,
        source: DishImageSource.EXTERNAL_FALLBACK,
        prompt,
        model: this.generator.getModel(),
        expiresAt,
      },
    });
    return imageUrl;
  }

  private isCacheUsable(expiresAt: Date | null): boolean {
    return expiresAt === null || expiresAt.getTime() > Date.now();
  }

  private positiveNumber(raw: string | undefined, fallback: number): number {
    const parsed = Number(raw);
    return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
  }
}
