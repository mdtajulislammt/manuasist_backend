import { randomUUID } from 'node:crypto';
import { Inject, Injectable, Logger } from '@nestjs/common';
import { ClientProxy } from '@nestjs/microservices';
import { ConfigService } from '@nestjs/config';
import { EVENT_PATTERNS } from '@contracts/events';
import type {
  ScanClassificationCompletedV1Payload,
  ScanSubmittedV1Payload,
} from '@contracts/ingestion-payloads';
import { RMQ_EVENT_CLIENT } from '@messaging/tokens';
import {
  classifyDish,
  CompositeNutritionProvider,
  EmbeddingClient,
  extractMenuDishes,
  LlmClient,
  OpenFoodFactsProvider,
  type UserPreferenceHints,
  UsdaFdcProvider,
} from '../../../../libs/ai-pipeline/src';
import { firstValueFrom } from 'rxjs';
import { Prisma } from '../../generated/prisma/client';
import { MenuScanStatus } from '../../generated/prisma/enums';
import { PrismaService } from '../prisma.service';
import { NutritionCacheService } from './nutrition-cache.service';

const NUTRITION_CACHE_TTL_SEC = 7 * 24 * 60 * 60;
const NUTRITION_PROVIDER_KEY = 'nutrition_v1';

@Injectable()
export class ScanProcessorService {
  private readonly logger = new Logger(ScanProcessorService.name);
  private readonly llm: LlmClient;
  private readonly embeddings: EmbeddingClient;
  private readonly nutrition: CompositeNutritionProvider;

  constructor(
    private readonly prisma: PrismaService,
    private readonly cache: NutritionCacheService,
    private readonly config: ConfigService,
    @Inject(RMQ_EVENT_CLIENT) private readonly rmq: ClientProxy,
  ) {
    this.llm = new LlmClient({
      apiKey: this.config.get<string>('OPENAI_API_KEY'),
      baseUrl: this.config.get<string>('OPENAI_BASE_URL'),
      model: this.config.get<string>('OPENAI_CHAT_MODEL'),
    });
    this.embeddings = new EmbeddingClient({
      apiKey: this.config.get<string>('OPENAI_API_KEY'),
      baseUrl: this.config.get<string>('OPENAI_BASE_URL'),
      model: this.config.get<string>('OPENAI_EMBEDDING_MODEL'),
    });
    const usda = new UsdaFdcProvider(
      this.config.get<string>('USDA_FDC_API_KEY'),
    );
    const off = new OpenFoodFactsProvider();
    this.nutrition = new CompositeNutritionProvider([
      ...(usda.isConfigured() ? [usda] : []),
      off,
    ]);
  }

  async handleScanSubmitted(payload: ScanSubmittedV1Payload) {
    const { scanId, userId, imageUrl } = payload;
    try {
      await this.prisma.menuScan.update({
        where: { id: scanId },
        data: {
          status: MenuScanStatus.PROCESSING,
          parseError: null,
        },
      });

      const demoOcr = this.placeholderOcrText(imageUrl);
      const extraction = await extractMenuDishes(demoOcr, this.llm);

      const prefs: UserPreferenceHints = {};
      const dishRows: Prisma.DishCreateManyInput[] = [];

      for (const line of extraction.dishes) {
        const classification = await classifyDish(line, prefs, this.llm);
        const nf = await this.lookupNutritionCached(line.name);
        const embedding = await this.embeddings.embedText(line.name);
        dishRows.push({
          id: randomUUID(),
          scanId,
          name: line.name.slice(0, 500),
          calories: nf.calories,
          dietScore: classification.dietScore,
          category: classification.category,
          allergenFlags: classification.allergenFlags
            ? (classification.allergenFlags as Prisma.InputJsonValue)
            : undefined,
          macros: {
            proteinG: nf.proteinG,
            carbG: nf.carbG,
            fatG: nf.fatG,
          } as Prisma.InputJsonValue,
          nutritionSource: nf.source,
          nutritionConfidence: nf.confidence,
          embedding: embedding
            ? (embedding as Prisma.InputJsonValue)
            : undefined,
        });
      }

      await this.prisma.$transaction(async (tx) => {
        await tx.dish.deleteMany({ where: { scanId } });
        if (dishRows.length > 0) {
          await tx.dish.createMany({ data: dishRows });
        }
        await tx.menuScan.update({
          where: { id: scanId },
          data: {
            status: MenuScanStatus.COMPLETED,
            rawOcrText: demoOcr,
            parseMetadata: {
              dishCount: dishRows.length,
              llmConfigured: this.llm.isConfigured(),
            } as object,
          },
        });
      });

      const done: ScanClassificationCompletedV1Payload = {
        scanId,
        userId,
        dishCount: dishRows.length,
      };
      await firstValueFrom(
        this.rmq.emit(EVENT_PATTERNS.SCAN_CLASSIFICATION_COMPLETED_V1, done),
      );
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      this.logger.error(`scan ${scanId} failed: ${msg}`, e instanceof Error ? e.stack : undefined);
      await this.prisma.menuScan.update({
        where: { id: scanId },
        data: {
          status: MenuScanStatus.FAILED,
          parseError: msg.slice(0, 2000),
        },
      });
    }
  }

  private placeholderOcrText(imageUrl: string): string {
    return [
      'Demo menu (OCR placeholder)',
      'Grilled Salmon Bowl — herb rice, seasonal vegetables',
      'Classic Caesar Salad — parmesan, croutons',
      `Source image: ${imageUrl.slice(0, 120)}`,
    ].join('\n');
  }

  private async lookupNutritionCached(name: string) {
    const cached = await this.cache.get(NUTRITION_PROVIDER_KEY, name);
    if (cached) {
      return cached;
    }
    const hit = await this.nutrition.lookup(name);
    const facts = hit ?? {
      calories: 250,
      source: 'estimate',
      confidence: 0.2,
    };
    await this.cache.set(NUTRITION_PROVIDER_KEY, name, facts, NUTRITION_CACHE_TTL_SEC);
    return facts;
  }

  /** Re-run pipeline for an existing scan (internal/admin). */
  async reprocessScan(scanId: string, userId: string, imageUrl: string) {
    await this.handleScanSubmitted({ scanId, userId, imageUrl });
  }
}
