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
import { MenuScanStatus } from '../../generated/prisma/enums';
import { AdminFileClientService } from '../clients/admin-file-client.service';
import { PrismaService } from '../prisma.service';
import { ScanProcessorService } from './scan-processor.service';
import { firstValueFrom } from 'rxjs';

const ALLOWED_MIME = new Set(['image/jpeg', 'image/png', 'image/webp']);

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
    private readonly scanProcessor: ScanProcessorService,
    @Inject(RMQ_EVENT_CLIENT) private readonly rmq: ClientProxy,
  ) {}

  private readonly logger = new Logger(ScansService.name);

  async createScanFromImage(userId: string, file: MulterFile) {
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

  async listScansForUser(userId: string) {
    const rows = await this.prisma.menuScan.findMany({
      where: { userId },
      orderBy: { scanTime: 'desc' },
      include: { dishes: true },
    });
    return { success: true, message: 'Scans listed', data: rows };
  }

  async getScanForUser(userId: string, scanId: string) {
    const row = await this.prisma.menuScan.findFirst({
      where: { id: scanId, userId },
      include: { dishes: true },
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
