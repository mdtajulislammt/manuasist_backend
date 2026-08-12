import { randomUUID } from 'node:crypto';
import { Inject, Injectable, Logger } from '@nestjs/common';
import { ClientProxy } from '@nestjs/microservices';
import { ConfigService } from '@nestjs/config';
import { EVENT_PATTERNS } from '@contracts/events';
import type {
  ScanClassificationCompletedV1Payload,
  ScanClassificationFailedV1Payload,
  ScanSubmittedV1Payload,
} from '@contracts/ingestion-payloads';
import { RMQ_EVENT_CLIENT } from '@messaging/tokens';
import {
  classifyDish,
  CompositeNutritionProvider,
  computeDishNai,
  computeScanNai,
  createOcrProvider,
  EmbeddingClient,
  type ExtractedDishLine,
  extractMenuDishes,
  LlmClient,
  OpenFoodFactsProvider,
  type OcrProviderPort,
  SpoonacularClient,
  type UserPreferenceHints,
  UsdaFdcProvider,
} from '../../../../libs/ai-pipeline/src';
import { firstValueFrom } from 'rxjs';
import { Prisma } from '../../generated/prisma/client';
import { MenuScanStatus } from '../../generated/prisma/enums';
import { ApplicationClientService } from '../clients/application-client.service';
import { AdminFileClientService } from '../clients/admin-file-client.service';
import { PatternsService } from '../patterns/patterns.service';
import { PrismaService } from '../prisma.service';
import { NutritionCacheService } from './nutrition-cache.service';
import { mapWithConcurrency } from './map-with-concurrency';

const NUTRITION_CACHE_TTL_SEC = 7 * 24 * 60 * 60;
const NUTRITION_PROVIDER_KEY = 'nutrition_v1';
const DEFAULT_DISH_CONCURRENCY = 4;

type ProcessedDish = {
  row: Prisma.DishCreateManyInput;
  naiScore: number;
  dishName: string;
  allergenFlags: Record<string, boolean> | undefined;
};

@Injectable()
export class ScanProcessorService {
  private readonly logger = new Logger(ScanProcessorService.name);
  private readonly llm: LlmClient;
  private readonly embeddings: EmbeddingClient;
  private readonly nutrition: CompositeNutritionProvider;
  private readonly ocr: OcrProviderPort;
  private readonly spoonacular: SpoonacularClient;
  private readonly dishConcurrency: number;

  constructor(
    private readonly prisma: PrismaService,
    private readonly cache: NutritionCacheService,
    private readonly config: ConfigService,
    private readonly applicationClient: ApplicationClientService,
    private readonly adminFiles: AdminFileClientService,
    private readonly patterns: PatternsService,
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
    this.ocr = createOcrProvider({
      googleVisionApiKey: this.config.get<string>('GOOGLE_VISION_API_KEY'),
      provider: this.config.get<string>('OCR_PROVIDER'),
    });
    this.spoonacular = new SpoonacularClient(
      this.config.get<string>('SPOONACULAR_API_KEY'),
    );
    const configured = Number(this.config.get<string>('SCAN_DISH_CONCURRENCY'));
    this.dishConcurrency =
      Number.isFinite(configured) && configured > 0
        ? Math.floor(configured)
        : DEFAULT_DISH_CONCURRENCY;
  }

  async handleScanSubmitted(payload: ScanSubmittedV1Payload) {
    const { scanId, userId } = payload;
    try {
      const claimed = await this.prisma.menuScan.updateMany({
        where: { id: scanId, status: MenuScanStatus.PENDING },
        data: {
          status: MenuScanStatus.PROCESSING,
          parseError: null,
        },
      });
      if (claimed.count === 0) {
        this.logger.debug(
          `Scan ${scanId} not PENDING — skip duplicate processing`,
        );
        return;
      }

      const prefs = await this.applicationClient.getUserPreferenceHints(userId);
      const { ocrText, parseMetadata } = await this.resolveMenuText(payload);

      const extraction = await extractMenuDishes(ocrText, this.llm);

      const dishPhaseStarted = Date.now();
      const processed = await mapWithConcurrency(
        extraction.dishes,
        this.dishConcurrency,
        (line) => this.processDishLine(scanId, line, prefs),
      );
      const dishPhaseMs = Date.now() - dishPhaseStarted;
      this.logger.log(
        `Scan ${scanId} dish phase: ${processed.length} dishes in ${dishPhaseMs}ms (concurrency=${this.dishConcurrency})`,
      );

      const dishRows = processed.map((p) => p.row);
      const naiScores = processed.map((p) => p.naiScore);
      const dishNames = processed.map((p) => p.dishName);
      const allergenFlagsList = processed.map((p) => p.allergenFlags);

      const scanNai = computeScanNai(naiScores);
      const summary = this.buildScanSummary(scanNai.naiScore, dishRows, prefs);

      await this.prisma.$transaction(async (tx) => {
        await tx.dish.deleteMany({ where: { scanId } });
        if (dishRows.length > 0) {
          await tx.dish.createMany({ data: dishRows });
        }
        await tx.menuScan.update({
          where: { id: scanId },
          data: {
            status: MenuScanStatus.COMPLETED,
            rawOcrText: ocrText,
            naiScore: scanNai.naiScore,
            naiBreakdown: scanNai.breakdown as Prisma.InputJsonValue,
            summary,
            parseMetadata: {
              ...parseMetadata,
              dishCount: dishRows.length,
              llmConfigured: this.llm.isConfigured(),
              dishConcurrency: this.dishConcurrency,
              dishPhaseMs,
            } as Prisma.InputJsonValue,
          },
        });
      });

      await this.patterns.updateFromCompletedScan({
        userId,
        dishNames,
        dishNaiScores: naiScores,
        allergenFlagsList,
        scanNaiScore: scanNai.naiScore,
      });

      const done: ScanClassificationCompletedV1Payload = {
        scanId,
        userId,
        dishCount: dishRows.length,
        naiScore: scanNai.naiScore,
      };
      await this.applicationClient.notifyScanReady(userId, scanId);
      await firstValueFrom(
        this.rmq.emit(EVENT_PATTERNS.SCAN_CLASSIFICATION_COMPLETED_V1, done),
      );
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      this.logger.error(
        `scan ${scanId} failed: ${msg}`,
        e instanceof Error ? e.stack : undefined,
      );
      await this.prisma.menuScan.update({
        where: { id: scanId },
        data: {
          status: MenuScanStatus.FAILED,
          parseError: msg.slice(0, 2000),
        },
      });
      await this.emitScanFailedBestEffort({
        scanId,
        userId,
        error: msg.slice(0, 2000),
      });
      await this.applicationClient.notifyScanFailed(
        userId,
        scanId,
        msg.slice(0, 2000),
      );
    }
  }

  private async processDishLine(
    scanId: string,
    line: ExtractedDishLine,
    prefs: UserPreferenceHints,
  ): Promise<ProcessedDish> {
    const nutritionPromise = this.lookupNutritionCached(line.name);
    const imagePromise = this.spoonacular.getDishImage(line.name);
    const embeddingPromise = this.embeddings.embedText(line.name);

    // Classification needs measured/estimated nutrition to explain profile
    // targets without inventing nutrient values. Image and embedding work stay
    // concurrent while nutrition is resolved.
    const nf = await nutritionPromise;
    const [classification, dishImageUrl, embedding] = await Promise.all([
      classifyDish(line, prefs, nf, this.llm),
      imagePromise,
      embeddingPromise,
    ]);

    const nai = computeDishNai({
      dietScore: classification.dietScore,
      nutritionConfidence: nf.confidence,
      calories: nf.calories,
      calorieTarget: prefs.calorieTarget,
      weightGoal: prefs.weightGoal,
      category: classification.category,
      allergenFlags: classification.allergenFlags,
      allergies: [...(prefs.allergies ?? []), ...(prefs.intolerances ?? [])],
    });

    return {
      naiScore: nai.naiScore,
      dishName: line.name,
      allergenFlags: classification.allergenFlags,
      row: {
        id: randomUUID(),
        scanId,
        name: line.name.slice(0, 500),
        imageUrl: dishImageUrl,
        calories: nf.calories,
        dietScore: classification.dietScore,
        naiScore: nai.naiScore,
        naiFactors: nai.factors as Prisma.InputJsonValue,
        category: classification.category,
        allergenFlags: classification.allergenFlags
          ? (classification.allergenFlags as Prisma.InputJsonValue)
          : undefined,
        explanation: {
          reasons: classification.reasons ?? [],
          summary: classification.summary,
        } as Prisma.InputJsonValue,
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
      },
    };
  }

  private async emitScanFailedBestEffort(
    payload: ScanClassificationFailedV1Payload,
  ) {
    try {
      await firstValueFrom(
        this.rmq.emit(EVENT_PATTERNS.SCAN_CLASSIFICATION_FAILED_V1, payload),
      );
    } catch (error) {
      this.logger.warn(
        `Failed to emit ${EVENT_PATTERNS.SCAN_CLASSIFICATION_FAILED_V1} for scan=${payload.scanId}: ${
          error instanceof Error ? error.message : String(error)
        }`,
      );
    }
  }

  private async resolveMenuText(
    payload: ScanSubmittedV1Payload,
  ): Promise<{ ocrText: string; parseMetadata: Record<string, unknown> }> {
    if (payload.menuText?.trim()) {
      return {
        ocrText: payload.menuText.trim(),
        parseMetadata: { source: 'menu_text', ocrProvider: 'none' },
      };
    }

    const storedFileName = payload.storedFileName;
    if (!storedFileName) {
      throw new Error('Scan has no stored image or menu text');
    }

    const { buffer, mimeType } =
      await this.adminFiles.fetchMenuScanBytes(storedFileName);
    const started = Date.now();
    const ocrResult = await this.ocr.extractText({
      imageBytes: buffer,
      mimeType: payload.contentType ?? mimeType,
    });
    return {
      ocrText: ocrResult.text,
      parseMetadata: {
        source: 'image_ocr',
        ocrProvider: ocrResult.provider,
        ocrConfidence: ocrResult.confidence,
        ocrMs: Date.now() - started,
        storedFileName,
      },
    };
  }

  private buildScanSummary(
    naiScore: number,
    dishes: Prisma.DishCreateManyInput[],
    prefs: UserPreferenceHints,
  ): string {
    const recommended = dishes.filter((d) => d.category === 'RECOMMENDED').length;
    const avoid = dishes.filter((d) => d.category === 'AVOID').length;
    const diet = prefs.dietType ? ` for your ${prefs.dietType} preference` : '';
    return `NAI ${naiScore}${diet}: ${recommended} recommended, ${avoid} to avoid, ${dishes.length} items analyzed.`;
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

  async reprocessScan(scanId: string, userId: string) {
    const scan = await this.prisma.menuScan.findUniqueOrThrow({
      where: { id: scanId },
    });
    await this.handleScanSubmitted({
      scanId,
      userId,
      storedFileName: scan.storedFileName ?? undefined,
      contentType: scan.contentType ?? undefined,
      menuText: scan.menuText ?? undefined,
      imageUrl: scan.imageUrl ?? undefined,
    });
  }
}
