import { HttpException, Inject, Injectable, InternalServerErrorException, Logger, NotFoundException } from '@nestjs/common';
import { ClientProxy } from '@nestjs/microservices';
import { EVENT_PATTERNS } from '@contracts/events';
import type { ScanSubmittedV1Payload } from '@contracts/ingestion-payloads';
import { RMQ_EVENT_CLIENT } from '@messaging/tokens';
import { MenuScanStatus } from '../../generated/prisma/enums';
import { PrismaService } from '../prisma.service';
import { firstValueFrom } from 'rxjs';

@Injectable()
export class ScansService {
  constructor(
    private readonly prisma: PrismaService,
    @Inject(RMQ_EVENT_CLIENT) private readonly rmq: ClientProxy,
  ) { }

  private readonly logger = new Logger(ScansService.name);

  async createScan(userId: string, imageUrl: string) {
    try {
      const scan = await this.prisma.menuScan.create({
        data: {
          userId,
          imageUrl,
          status: MenuScanStatus.PENDING,
        },
      });
      const payload: ScanSubmittedV1Payload = {
        scanId: scan.id,
        userId,
        imageUrl,
      };
      await firstValueFrom(this.rmq.emit(EVENT_PATTERNS.SCAN_SUBMITTED_V1, payload));
      return {
        success: true,
        message: 'Scan submitted for processing',
        data: scan,
      };
    } catch (error) {
      if (error instanceof HttpException) {
        throw error;
      }
      this.logger.error(`Failed to create scan: ${error instanceof Error ? error.message : String(error)}`, error instanceof Error ? error.stack : undefined);
      throw new InternalServerErrorException('Failed to create scan');
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
