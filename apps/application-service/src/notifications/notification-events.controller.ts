import { Controller, Logger } from '@nestjs/common';
import { EventPattern, Payload } from '@nestjs/microservices';
import { EVENT_PATTERNS } from '@contracts/events';
import type {
  ScanClassificationCompletedV1Payload,
  ScanClassificationFailedV1Payload,
  ScanSubmittedV1Payload,
} from '@contracts/ingestion-payloads';
import { NotificationsService } from './notifications.service';

@Controller()
export class NotificationEventsController {
  private readonly logger = new Logger(NotificationEventsController.name);

  constructor(private readonly notifications: NotificationsService) { }

  @EventPattern(EVENT_PATTERNS.SCAN_SUBMITTED_V1)
  async onScanSubmitted(@Payload() payload: ScanSubmittedV1Payload) {
    await this.runSafely(EVENT_PATTERNS.SCAN_SUBMITTED_V1, payload, () =>
      this.notifications.notifyScanProcessing(payload.userId, payload.scanId),
    );
  }

  @EventPattern(EVENT_PATTERNS.SCAN_CLASSIFICATION_COMPLETED_V1)
  async onScanCompleted(
    @Payload() payload: ScanClassificationCompletedV1Payload,
  ) {
    await this.runSafely(
      EVENT_PATTERNS.SCAN_CLASSIFICATION_COMPLETED_V1,
      payload,
      () => this.notifications.notifyScanReady(payload.userId, payload.scanId),
    );
  }

  @EventPattern(EVENT_PATTERNS.SCAN_CLASSIFICATION_FAILED_V1)
  async onScanFailed(@Payload() payload: ScanClassificationFailedV1Payload) {
    await this.runSafely(
      EVENT_PATTERNS.SCAN_CLASSIFICATION_FAILED_V1,
      payload,
      () =>
        this.notifications.notifyScanFailed(
          payload.userId,
          payload.scanId,
          payload.error,
        ),
    );
  }

  private async runSafely(
    eventName: string,
    payload: { scanId?: string; userId?: string },
    handler: () => Promise<unknown>,
  ) {
    try {
      await handler();
    } catch (error) {
      this.logger.error(
        `Failed to create notification for ${eventName} scan=${payload.scanId ?? 'unknown'} user=${payload.userId ?? 'unknown'}: ${error instanceof Error ? error.message : String(error)
        }`,
        error instanceof Error ? error.stack : undefined,
      );
    }
  }
}
