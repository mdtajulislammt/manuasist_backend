import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Query,
  UnauthorizedException,
} from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiCreatedResponse,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
  ApiUnauthorizedResponse,
} from '@nestjs/swagger';
import { CurrentUserId } from '../decorators/current-user-id.decorator';
import { ListNotificationsQueryDto } from './dto/list-notifications-query.dto';
import { RegisterDeviceTokenDto } from './dto/register-device-token.dto';
import { NotificationsService } from './notifications.service';

@Controller('notifications')
@ApiTags('Notifications')
@ApiBearerAuth()
@ApiUnauthorizedResponse({ description: 'Missing or invalid Bearer token' })
export class NotificationsController {
  constructor(private readonly notifications: NotificationsService) {}

  @Get()
  @ApiOperation({ summary: 'Get grouped notification inbox for the user' })
  @ApiOkResponse({ description: 'Notifications returned' })
  getNotifications(
    @CurrentUserId() userId: string | undefined,
    @Query() query: ListNotificationsQueryDto,
  ) {
    return this.notifications.getNotifications(this.requireUserId(userId), query);
  }

  @Patch('read-all')
  @ApiOperation({ summary: 'Mark all notifications as read' })
  @ApiOkResponse({ description: 'Notifications marked as read' })
  markAllRead(@CurrentUserId() userId: string | undefined) {
    return this.notifications.markAllRead(this.requireUserId(userId));
  }

  @Patch(':id/read')
  @ApiOperation({ summary: 'Mark one notification as read' })
  @ApiOkResponse({ description: 'Notification marked as read' })
  markRead(
    @CurrentUserId() userId: string | undefined,
    @Param('id', ParseUUIDPipe) notificationId: string,
  ) {
    return this.notifications.markRead(
      this.requireUserId(userId),
      notificationId,
    );
  }

  @Post('device-tokens')
  @ApiOperation({ summary: 'Register or refresh a Flutter FCM device token' })
  @ApiCreatedResponse({ description: 'Device token registered' })
  registerDeviceToken(
    @CurrentUserId() userId: string | undefined,
    @Body() dto: RegisterDeviceTokenDto,
  ) {
    return this.notifications.registerDeviceToken(
      this.requireUserId(userId),
      dto,
    );
  }

  @Delete('device-tokens/:deviceId')
  @HttpCode(200)
  @ApiOperation({ summary: 'Disable a device token for logout/uninstall flow' })
  @ApiOkResponse({ description: 'Device token disabled' })
  disableDeviceToken(
    @CurrentUserId() userId: string | undefined,
    @Param('deviceId') deviceId: string,
  ) {
    return this.notifications.disableDeviceToken(
      this.requireUserId(userId),
      deviceId,
    );
  }

  private requireUserId(userId: string | undefined): string {
    if (!userId) {
      throw new UnauthorizedException('User id missing from token');
    }
    return userId;
  }
}
