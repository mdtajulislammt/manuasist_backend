import { Module } from '@nestjs/common';
import { AiIngestionHomeClientService } from './ai-ingestion-home-client.service';
import { HomeController } from './home.controller';
import { HomeService } from './home.service';

@Module({
  controllers: [HomeController],
  providers: [AiIngestionHomeClientService, HomeService],
})
export class HomeModule {}
