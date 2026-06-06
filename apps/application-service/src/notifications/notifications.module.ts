import { Module } from '@nestjs/common';
import { ScheduleModule } from '@nestjs/schedule';
import { FcmPushService } from './fcm-push.service';
import { NotificationsController } from './notifications.controller';
import { NotificationsGateway } from './notifications.gateway';
import { NotificationsService } from './notifications.service';

@Module({
  imports: [ScheduleModule.forRoot()],
  controllers: [NotificationsController],
  providers: [NotificationsService, NotificationsGateway, FcmPushService],
  exports: [NotificationsService],
})
export class NotificationsModule {}
