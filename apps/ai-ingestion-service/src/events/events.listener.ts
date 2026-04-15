import { Controller, Logger } from '@nestjs/common';
import { EventPattern, Payload } from '@nestjs/microservices';
import { EVENT_PATTERNS } from '@contracts/events';

@Controller()
export class EventsListenerController {
  private readonly logger = new Logger(EventsListenerController.name);

  @EventPattern(EVENT_PATTERNS.SYSTEM_PING_V1)
  onSystemPing(@Payload() payload: unknown) {
    this.logger.log(`RMQ event ${EVENT_PATTERNS.SYSTEM_PING_V1}: ${JSON.stringify(payload)}`);
  }
}
