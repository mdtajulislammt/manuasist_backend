import { Module } from '@nestjs/common';
import { AnalyticsController } from './analytics.controller';
import { AnalyticsService } from './analytics.service';
import { ApplicationAnalyticsClientService } from './application-analytics-client.service';
import { AuthAnalyticsClientService } from './auth-analytics-client.service';
import { IngestionAnalyticsClientService } from './ingestion-analytics-client.service';

@Module({
  controllers: [AnalyticsController],
  providers: [
    AnalyticsService,
    AuthAnalyticsClientService,
    IngestionAnalyticsClientService,
    ApplicationAnalyticsClientService,
  ],
  exports: [
    AnalyticsService,
    AuthAnalyticsClientService,
    ApplicationAnalyticsClientService,
  ],
})
export class AnalyticsModule {}
