import { Module } from '@nestjs/common';
import { AiIngestionClientModule } from '../ai-ingestion-client/ai-ingestion-client.module';
import { MealsController } from './meals.controller';
import { MealsService } from './meals.service';

@Module({
  imports: [AiIngestionClientModule],
  controllers: [MealsController],
  providers: [MealsService],
  exports: [MealsService],
})
export class MealsModule {}
