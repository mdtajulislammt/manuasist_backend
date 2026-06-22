import { Body, Controller, Post, UseGuards } from '@nestjs/common';
import {
  ApiHeader,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
  ApiUnauthorizedResponse,
} from '@nestjs/swagger';
import { Public } from '@menu-assist/api-auth';
import { InternalApiKeyGuard } from '../internal-api-key.guard';
import {
  InternalScanNotificationDto,
  InternalScanNotificationType,
} from './dto/internal-scan-notification.dto';
import { NotificationsService } from '../notifications/notifications.service';
import { toNotificationTypeApi } from '../notifications/notification-type';

@Controller('internal/notifications')
@ApiTags('Internal — notifications')
@Public()
@UseGuards(InternalApiKeyGuard)
@ApiHeader({ name: 'x-internal-api-key', required: true })
@ApiUnauthorizedResponse({ description: 'Invalid or missing internal API key' })
export class InternalNotificationsController {
  constructor(private readonly notifications: NotificationsService) {}

  @Post('scan-event')
  @ApiOperation({ summary: 'Create a scan lifecycle notification' })
  @ApiOkResponse({ description: 'Notification created or already exists.' })
  async createScanEventNotification(@Body() dto: InternalScanNotificationDto) {
    const notification =
      dto.type === InternalScanNotificationType.PROCESSING
        ? await this.notifications.notifyScanProcessing(dto.userId, dto.scanId)
        : dto.type === InternalScanNotificationType.READY
          ? await this.notifications.notifyScanReady(dto.userId, dto.scanId)
          : await this.notifications.notifyScanFailed(
              dto.userId,
              dto.scanId,
              dto.error ?? 'Scan processing failed',
            );

    return {
      success: true,
      message: 'Notification created',
      data: {
        id: notification.id,
        type: toNotificationTypeApi(notification.type),
      },
    };
  }
}
