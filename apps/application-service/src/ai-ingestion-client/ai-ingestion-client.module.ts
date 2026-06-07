import { Module } from '@nestjs/common';
import { AiIngestionHomeClientService } from '../home/ai-ingestion-home-client.service';
import { AiIngestionDishesClientService } from '../meals/ai-ingestion-dishes-client.service';

@Module({
  providers: [AiIngestionHomeClientService, AiIngestionDishesClientService],
  exports: [AiIngestionHomeClientService, AiIngestionDishesClientService],
})
export class AiIngestionClientModule {}
