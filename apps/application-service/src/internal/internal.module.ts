import { Module } from '@nestjs/common';
import { AdminInternalModule } from '../admin-internal/admin-internal.module';
import { MembershipModule } from '../membership/membership.module';
import { NotificationsModule } from '../notifications/notifications.module';
import { InternalApiKeyGuard } from '../internal-api-key.guard';
import { InternalNotificationsController } from './internal-notifications.controller';
import { InternalAnalyticsController } from './internal-analytics.controller';
import { InternalAnalyticsService } from './internal-analytics.service';
import { InternalUsersController } from './internal-users.controller';
import { InternalUsersService } from './internal-users.service';

@Module({
  imports: [AdminInternalModule, MembershipModule, NotificationsModule],
  controllers: [
    InternalUsersController,
    InternalNotificationsController,
    InternalAnalyticsController,
  ],
  providers: [InternalUsersService, InternalApiKeyGuard, InternalAnalyticsService],
  exports: [InternalUsersService],
})
export class InternalModule {}
