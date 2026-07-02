import { Module } from '@nestjs/common';
import { AnalyticsModule } from '../analytics/analytics.module';
import { PrismaModule } from '../prisma.module';
import { UsersService } from '../users/users.service';
import { SubscriptionListController } from './subscription-list.controller';
import { SubscriptionListService } from './subscription-list.service';

@Module({
  imports: [AnalyticsModule, PrismaModule],
  controllers: [SubscriptionListController],
  providers: [SubscriptionListService, UsersService],
})
export class SubscriptionListModule {}
