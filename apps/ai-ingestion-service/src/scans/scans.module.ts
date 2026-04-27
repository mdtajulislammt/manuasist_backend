import { Module } from '@nestjs/common';
import { createRmqEventClientProvider } from '@messaging/rmq-client.provider';
import { ScansController } from './scans.controller';
import { ScansService } from './scans.service';
import { ScanProcessorService } from './scan-processor.service';
import { NutritionCacheService } from './nutrition-cache.service';
import { RmqConnectService } from './rmq-connect.service';

@Module({
  controllers: [ScansController],
  providers: [
    createRmqEventClientProvider('ai-ingestion-http'),
    RmqConnectService,
    ScansService,
    NutritionCacheService,
    ScanProcessorService,
  ],
  exports: [ScansService, ScanProcessorService],
})
export class ScansModule {}
