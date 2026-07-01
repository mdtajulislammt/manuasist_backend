import { Module } from '@nestjs/common';
import { AiIngestionClientModule } from '../ai-ingestion-client/ai-ingestion-client.module';
import { MealsModule } from '../meals/meals.module';
import { PrismaModule } from '../prisma.module';
import { UsersMeModule } from '../users-me/users-me.module';
import { AiIngestionAnalyticsClientService } from './ai-ingestion-analytics-client.service';
import { AnalyticsController } from './analytics.controller';
import { AnalyticsService } from './analytics.service';

@Module({
  imports: [
    AiIngestionClientModule,
    MealsModule,
    UsersMeModule,
    PrismaModule,
  ],
  controllers: [AnalyticsController],
  providers: [AnalyticsService, AiIngestionAnalyticsClientService],
})
export class AnalyticsModule {}
