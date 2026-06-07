import { Module } from '@nestjs/common';
import { AiIngestionClientModule } from '../ai-ingestion-client/ai-ingestion-client.module';
import { MealsModule } from '../meals/meals.module';
import { HomeController } from './home.controller';
import { HomeService } from './home.service';

@Module({
  imports: [AiIngestionClientModule, MealsModule],
  controllers: [HomeController],
  providers: [HomeService],
})
export class HomeModule {}
