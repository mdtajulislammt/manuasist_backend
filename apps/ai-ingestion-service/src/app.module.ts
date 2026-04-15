import { Module } from '@nestjs/common';
import { HealthController } from './health.controller';
import { EventsListenerController } from './events/events.listener';

@Module({
  imports: [],
  controllers: [HealthController, EventsListenerController],
  providers: [],
})
export class AppModule {}
