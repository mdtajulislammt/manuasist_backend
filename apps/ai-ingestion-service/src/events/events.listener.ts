import { Controller, Logger } from '@nestjs/common';
import { EventPattern, Payload } from '@nestjs/microservices';
import { EVENT_PATTERNS } from '@contracts/events';
import type { ScanSubmittedV1Payload } from '@contracts/ingestion-payloads';
import { ScanProcessorService } from '../scans/scan-processor.service';

@Controller()
export class EventsListenerController {
  private readonly logger = new Logger(EventsListenerController.name);

  constructor(private readonly scanProcessor: ScanProcessorService) {}

  @EventPattern(EVENT_PATTERNS.SYSTEM_PING_V1)
  onSystemPing(@Payload() payload: unknown) {
    this.logger.log(
      `RMQ event ${EVENT_PATTERNS.SYSTEM_PING_V1}: ${JSON.stringify(payload)}`,
    );
  }

  @EventPattern(EVENT_PATTERNS.SCAN_SUBMITTED_V1)
  async onScanSubmitted(@Payload() payload: ScanSubmittedV1Payload) {
    this.logger.log(`Processing ${EVENT_PATTERNS.SCAN_SUBMITTED_V1} scan=${payload.scanId}`);
    await this.scanProcessor.handleScanSubmitted(payload);
  }
}
