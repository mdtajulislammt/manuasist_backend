import {
  BadRequestException,
  HttpException,
  Inject,
  Injectable,
  InternalServerErrorException,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { ClientProxy } from '@nestjs/microservices';
import { EVENT_PATTERNS } from '@contracts/events';
import type { ScanSubmittedV1Payload } from '@contracts/ingestion-payloads';
import { RMQ_EVENT_CLIENT } from '@messaging/tokens';
import { DishCategory, MenuScanStatus } from '../../generated/prisma/enums';
import { AdminFileClientService } from '../clients/admin-file-client.service';
import { ApplicationClientService } from '../clients/application-client.service';
import { PrismaService } from '../prisma.service';
import { ListScansQueryDto } from './dto/list-scans-query.dto';
import { ScanProcessorService } from './scan-processor.service';
import { firstValueFrom } from 'rxjs';

const ALLOWED_MIME = new Set(['image/jpeg', 'image/png', 'image/webp']);
const DATE_FORMATTER = new Intl.DateTimeFormat('en-US', {
  month: '2-digit',
  day: '2-digit',
  year: 'numeric',
});
const TIME_FORMATTER = new Intl.DateTimeFormat('en-US', {
  hour: 'numeric',
  minute: '2-digit',
});
const DEFAULT_SCAN_HISTORY_PAGE = 1;
const DEFAULT_SCAN_HISTORY_LIMIT = 20;
const MAX_SCAN_HISTORY_LIMIT = 50;

type MulterFile = {
  buffer: Buffer;
  originalname: string;
  mimetype: string;
  size: number;
};

@Injectable()
export class ScansService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly adminFiles: AdminFileClientService,
    private readonly applicationClient: ApplicationClientService,
    private readonly scanProcessor: ScanProcessorService,
    @Inject(RMQ_EVENT_CLIENT) private readonly rmq: ClientProxy,
  ) { }

  private readonly logger = new Logger(ScansService.name);

  async createScanFromImage(userId: string, file: MulterFile) {
    await this.applicationClient.assertCanCreateScan(userId);
    const mime = (file.mimetype || '').toLowerCase();
    if (!ALLOWED_MIME.has(mime)) {
      throw new BadRequestException(
        'Unsupported image type. Use JPEG, PNG, or WebP.',
      );
    }
    if (!file.buffer?.length) {
      throw new BadRequestException('Empty image file');
    }

    const stored = await this.adminFiles.uploadMenuScan(file);
    const imageUrl = this.adminFiles.buildPublicImageUrl(stored.storedName);

    try {
      const scan = await this.prisma.menuScan.create({
        data: {
          userId,
          storedFileName: stored.storedName,
          contentType: stored.contentType,
          imageUrl,
          status: MenuScanStatus.PENDING,
        },
      });
      this.dispatchScanSubmitted({
        scanId: scan.id,
        userId,
        storedFileName: stored.storedName,
        contentType: stored.contentType,
        imageUrl,
      });
      await this.applicationClient.consumeScanCredit(userId);
      return {
        success: true,
        message: 'Scan submitted for processing',
        data: scan,
      };
    } catch (error) {
      if (error instanceof HttpException) {
        throw error;
      }
      this.logger.error(
        `Failed to create scan: ${error instanceof Error ? error.message : String(error)}`,
      );
      throw new InternalServerErrorException('Failed to create scan');
    }
  }

  async createScanFromText(userId: string, menuText: string) {
    await this.applicationClient.assertCanCreateScan(userId);
    const text = menuText.trim();
    if (!text) {
      throw new BadRequestException('menuText must not be empty');
    }
    try {
      const scan = await this.prisma.menuScan.create({
        data: {
          userId,
          menuText: text,
          status: MenuScanStatus.PENDING,
        },
      });
      this.dispatchScanSubmitted({
        scanId: scan.id,
        userId,
        menuText: text,
      });
      await this.applicationClient.consumeScanCredit(userId);
      return {
        success: true,
        message: 'Text scan submitted for processing',
        data: scan,
      };
    } catch (error) {
      if (error instanceof HttpException) {
        throw error;
      }
      throw new InternalServerErrorException('Failed to create text scan');
    }
  }

  /**
   * Process scans in-process so dev works without RMQ routing.
   * Also emits to RabbitMQ when available (consumer may no-op if already claimed).
   */
  private dispatchScanSubmitted(payload: ScanSubmittedV1Payload) {
    void this.emitScanSubmittedBestEffort(payload);
    setImmediate(() => {
      void this.scanProcessor.handleScanSubmitted(payload).catch((err) => {
        this.logger.error(
          `In-process scan processing failed for ${payload.scanId}`,
          err instanceof Error ? err.stack : String(err),
        );
      });
    });
  }

  private async emitScanSubmittedBestEffort(payload: ScanSubmittedV1Payload) {
    try {
      await firstValueFrom(
        this.rmq.emit(EVENT_PATTERNS.SCAN_SUBMITTED_V1, payload),
      );
    } catch (err) {
      this.logger.warn(
        `RMQ emit failed for scan ${payload.scanId}: ${err instanceof Error ? err.message : String(err)}`,
      );
    }
  }

  async listScansForUser(
    userId: string,
    pagination: ListScansQueryDto = {},
  ) {
    try {
      const page = this.positiveInt(
        pagination.page,
        DEFAULT_SCAN_HISTORY_PAGE,
      );
      const limit = Math.min(
        this.positiveInt(pagination.limit, DEFAULT_SCAN_HISTORY_LIMIT),
        MAX_SCAN_HISTORY_LIMIT,
      );
      const skip = (page - 1) * limit;

      const [total, rows] = await this.prisma.$transaction([
        this.prisma.menuScan.count({ where: { userId } }),
        this.prisma.menuScan.findMany({
          where: { userId },
          orderBy: { scanTime: 'desc' },
          skip,
          take: limit,
          include: {
            dishes: {
              select: {
                id: true,
                name: true,
                category: true,
                naiScore: true,
                dietScore: true,
                calories: true,
              },
            },
          },
        }),
      ]);
      const items = rows.map((scan) => {
        const counts = this.countDishCategories(scan.dishes);
        const scannedAt = scan.scanTime;
        return {
          id: scan.id,
          scanId: scan.id,
          title: this.buildHistoryTitle(scan),
          subtitle: `Scanned on: ${this.formatScannedAt(scannedAt)}`,
          imageUrl: scan.imageUrl,
          thumbnailUrl: scan.imageUrl,
          status: scan.status,
          scannedAt,
          dateGroupKey: this.dateGroupKey(scannedAt),
          dateGroupLabel: this.dateGroupLabel(scannedAt),
          dishCount: scan.dishes.length,
          counts,
          naiScore: scan.naiScore,
          naiImpactPoints: this.naiImpactPoints(scan.naiScore),
          summary: scan.summary,
          topDishes: this.topDishNames(scan.dishes),
        };
      });
      return {
        success: true,
        message: 'Menu scan history listed successfully.',
        data: {
          items,
          pagination: {
            page,
            limit,
            total,
            totalPages: Math.ceil(total / limit),
            hasNextPage: skip + items.length < total,
            hasPreviousPage: page > 1,
          },
        },
      };
    } catch (error) {
      if (error instanceof HttpException) {
        throw error;
      }
      this.logger.error(
        `Failed to list menu scans for user ${userId}: ${error instanceof Error ? error.message : String(error)}`,
      );
      throw new InternalServerErrorException('Failed to list menu scans');
    }
  }

  private positiveInt(value: number | undefined, fallback: number) {
    const parsed = value ?? fallback;
    return Number.isFinite(parsed) && parsed > 0 ? Math.floor(parsed) : fallback;
  }

  private countDishCategories(
    dishes: Array<{ category: DishCategory }>,
  ): { recommended: number; caution: number; avoid: number } {
    return {
      recommended: dishes.filter(
        (dish) => dish.category === DishCategory.RECOMMENDED,
      ).length,
      caution: dishes.filter((dish) => dish.category === DishCategory.CAUTION)
        .length,
      avoid: dishes.filter((dish) => dish.category === DishCategory.AVOID)
        .length,
    };
  }

  private buildHistoryTitle(scan: {
    menuText: string | null;
    rawOcrText: string | null;
    summary: string | null;
  }): string {
    const firstLine = (scan.menuText ?? scan.rawOcrText ?? '')
      .split(/\r?\n/)
      .map((line) => line.trim())
      .find(Boolean);
    if (firstLine) {
      return this.compactTitle(firstLine);
    }
    return scan.summary ? 'Analyzed Menu' : 'Menu Scan';
  }

  private compactTitle(value: string): string {
    const normalized = value.replace(/\s+/g, ' ').trim();
    return normalized.length > 48
      ? `${normalized.slice(0, 45).trim()}...`
      : normalized;
  }

  private formatScannedAt(date: Date): string {
    return `${DATE_FORMATTER.format(date)}, ${TIME_FORMATTER.format(date)}`;
  }

  private dateGroupKey(date: Date): string {
    return date.toISOString().slice(0, 10);
  }

  private dateGroupLabel(date: Date): string {
    return this.isToday(date) ? 'Today' : DATE_FORMATTER.format(date);
  }

  private isToday(date: Date): boolean {
    const now = new Date();
    return (
      now.getFullYear() === date.getFullYear() &&
      now.getMonth() === date.getMonth() &&
      now.getDate() === date.getDate()
    );
  }

  private naiImpactPoints(naiScore: number | null): number | null {
    return naiScore === null ? null : Math.max(0, Math.round(naiScore / 10));
  }

  private topDishNames(
    dishes: Array<{
      name: string;
      naiScore: number | null;
      dietScore: number;
    }>,
  ): string[] {
    return [...dishes]
      .sort((a, b) => (b.naiScore ?? b.dietScore) - (a.naiScore ?? a.dietScore))
      .slice(0, 3)
      .map((dish) => dish.name);
  }

  async getScanForUser(userId: string, scanId: string) {
    const row = await this.prisma.menuScan.findFirst({
      where: { id: scanId, userId },
      include: {
        dishes: {
          omit: {
            embedding: true,
          },
        }
      },
    });
    if (!row) {
      throw new NotFoundException('Scan not found');
    }
    return { success: true, message: 'Scan retrieved', data: row };
  }

  async getScanByIdInternal(scanId: string) {
    const row = await this.prisma.menuScan.findUnique({
      where: { id: scanId },
      include: { dishes: true },
    });
    if (!row) {
      throw new NotFoundException('Scan not found');
    }
    return row;
  }

  async listRecentInternal(limit: number) {
    const rows = await this.prisma.menuScan.findMany({
      orderBy: { createdAt: 'desc' },
      take: Math.min(Math.max(limit, 1), 100),
      include: { dishes: true },
    });
    return rows;
  }
}
