import { Module } from '@nestjs/common';
import { createRmqEventClientProvider } from '@messaging/rmq-client.provider';
import { ClientsModule } from '../clients/clients.module';
import { PatternsModule } from '../patterns/patterns.module';
import { RecommendationsController } from '../recommendations/recommendations.controller';
import { RecommendationsService } from '../recommendations/recommendations.service';
import { ScansController } from './scans.controller';
import { ScansService } from './scans.service';
import { ScanProcessorService } from './scan-processor.service';
import { NutritionCacheService } from './nutrition-cache.service';
import { RmqConnectService } from './rmq-connect.service';

@Module({
  imports: [ClientsModule, PatternsModule],
  controllers: [ScansController, RecommendationsController],
  providers: [
    createRmqEventClientProvider('ai-ingestion-http'),
    RmqConnectService,
    ScansService,
    NutritionCacheService,
    ScanProcessorService,
    RecommendationsService,
  ],
  exports: [ScansService, ScanProcessorService, RecommendationsService],
})
export class ScansModule { }
