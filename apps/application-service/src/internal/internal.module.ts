import { Module } from '@nestjs/common';
import { AdminInternalModule } from '../admin-internal/admin-internal.module';
import { MembershipModule } from '../membership/membership.module';
import { NotificationsModule } from '../notifications/notifications.module';
import { ReferralsModule } from '../referrals/referrals.module';
import { InternalApiKeyGuard } from '../internal-api-key.guard';
import { InternalNotificationsController } from './internal-notifications.controller';
import { InternalAnalyticsController } from './internal-analytics.controller';
import { InternalAnalyticsService } from './internal-analytics.service';
import { InternalUsersController } from './internal-users.controller';
import { InternalUsersService } from './internal-users.service';
import { InternalReferralsController } from './internal-referrals.controller';

@Module({
  imports: [
    AdminInternalModule,
    MembershipModule,
    NotificationsModule,
    ReferralsModule,
  ],
  controllers: [
    InternalUsersController,
    InternalNotificationsController,
    InternalAnalyticsController,
    InternalReferralsController,
  ],
  providers: [InternalUsersService, InternalApiKeyGuard, InternalAnalyticsService],
  exports: [InternalUsersService],
})
export class InternalModule {}
