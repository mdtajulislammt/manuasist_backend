import { ApiProperty } from '@nestjs/swagger';
import { NOTIFICATION_TYPE_API_VALUES } from '../notification-type';

export class NotificationCardDto {
  @ApiProperty({ format: 'uuid' })
  id!: string;

  @ApiProperty({
    enum: NOTIFICATION_TYPE_API_VALUES,
    example: 'scan_result_ready',
    description:
      'Stable notification type for client navigation and actions. Do not infer behavior from title.',
  })
  type!: (typeof NOTIFICATION_TYPE_API_VALUES)[number];

  @ApiProperty({ example: 'Your Results Are Ready!' })
  title!: string;

  @ApiProperty({
    example: 'Check out recommended options tailored to your preferences.',
  })
  body!: string;

  @ApiProperty({ example: 'bell' })
  icon!: string;

  @ApiProperty({ example: '32m ago' })
  timeLabel!: string;

  @ApiProperty({ example: false })
  isRead!: boolean;

  @ApiProperty({
    type: 'object',
    additionalProperties: true,
    description:
      'Action/navigation payload (e.g. scanId, subscriptionId, profileId, url).',
    example: { scanId: '0d0a021e-de09-4c55-9c4d-611aea276d5a' },
  })
  data!: Record<string, unknown>;
}

export class NotificationSectionDto {
  @ApiProperty({ example: 'Today' })
  title!: string;

  @ApiProperty({ type: [NotificationCardDto] })
  items!: NotificationCardDto[];
}

export class NotificationPaginationDto {
  @ApiProperty({ example: 1 })
  page!: number;

  @ApiProperty({ example: 20 })
  limit!: number;

  @ApiProperty({ example: false })
  hasMore!: boolean;
}

export class NotificationsListDataDto {
  @ApiProperty({ example: 3 })
  unreadCount!: number;

  @ApiProperty({ type: [NotificationSectionDto] })
  sections!: NotificationSectionDto[];

  @ApiProperty({ type: NotificationPaginationDto })
  pagination!: NotificationPaginationDto;
}

export class NotificationsListResponseDto {
  @ApiProperty({ example: true })
  success!: boolean;

  @ApiProperty({ example: 'Notifications retrieved successfully' })
  message!: string;

  @ApiProperty({ type: NotificationsListDataDto })
  data!: NotificationsListDataDto;
}
