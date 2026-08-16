import {
    HttpException,
    Injectable,
    InternalServerErrorException,
  Logger,
    NotFoundException,
} from '@nestjs/common';
import { Interval } from '@nestjs/schedule';
import {
    DevicePlatform,
    NotificationChannel,
    NotificationDeliveryStatus,
    NotificationType,
    Prisma,
} from '../../generated/prisma/client';
import { PrismaService } from '../prisma.service';
import { DevicePlatformDto, RegisterDeviceTokenDto } from './dto/register-device-token.dto';
import { ListNotificationsQueryDto } from './dto/list-notifications-query.dto';
import { FcmPushService } from './fcm-push.service';
import {
  assertNotificationDataForType,
  toNotificationTypeApi,
  type NotificationTypeApiValue,
} from './notification-type';
import { NotificationsGateway } from './notifications.gateway';

const DEFAULT_PAGE = 1;
const DEFAULT_LIMIT = 20;
const MAX_RETRY_ATTEMPTS = 5;
const RETRY_BATCH_SIZE = 50;

type NotificationCreateInput = {
    userId: string;
    title: string;
    body: string;
    type: NotificationType;
    icon?: string;
    data?: Record<string, unknown>;
    dedupeKey?: string;
    expiresAt?: Date;
};

type NotificationCard = {
    id: string;
    type: NotificationTypeApiValue;
    title: string;
    body: string;
    icon: string;
    timeLabel: string;
    isRead: boolean;
    data: Record<string, unknown>;
};

@Injectable()
export class NotificationsService {
  private readonly logger = new Logger(NotificationsService.name);

    constructor(
        private readonly prisma: PrismaService,
        private readonly fcm: FcmPushService,
        private readonly gateway: NotificationsGateway,
    ) { }

    async getNotifications(userId: string, query: ListNotificationsQueryDto = {}) {
        try {
            const page = query.page ?? DEFAULT_PAGE;
            const limit = query.limit ?? DEFAULT_LIMIT;
            const now = new Date();
            const where: Prisma.UserNotificationWhereInput = {
                userId,
                OR: [{ expiresAt: null }, { expiresAt: { gt: now } }],
            };

            const [rows, unreadCount] = await Promise.all([
                this.prisma.userNotification.findMany({
                    where,
                    orderBy: { createdAt: 'desc' },
                    skip: (page - 1) * limit,
                    take: limit + 1,
                }),
                this.prisma.userNotification.count({
                    where: { ...where, readAt: null },
                }),
            ]);

            const hasMore = rows.length > limit;
            const items = rows.slice(0, limit).map((row) => this.mapCard(row, now));

            return {
                success: true,
                message: 'Notifications retrieved successfully',
                data: {
                    unreadCount,
                    sections: this.groupCards(items, rows.slice(0, limit)),
                    pagination: {
                        page,
                        limit,
                        hasMore,
                    },
                },
            };
        } catch (error) {
            if (error instanceof HttpException) {
                throw error;
            }
            throw new InternalServerErrorException('Failed to get notifications');
        }
    }

    async markRead(userId: string, notificationId: string) {
        try {
            const notification = await this.prisma.userNotification.findFirst({
                where: { id: notificationId, userId },
            });
            if (!notification) {
                throw new NotFoundException('Notification not found');
            }

            const readAt = notification.readAt ?? new Date();
            const updated = await this.prisma.userNotification.update({
                where: { id: notification.id },
                data: { readAt },
            });
            this.gateway.emitNotificationRead(userId, notification.id);

            return {
                success: true,
                message: 'Notification marked as read',
                data: {
                    id: updated.id,
                    isRead: true,
                    readAt: updated.readAt,
                },
            };
        } catch (error) {
            if (error instanceof HttpException) {
                throw error;
            }
            throw new InternalServerErrorException('Failed to mark notification as read');
        }
    }

    async markAllRead(userId: string) {
        try {
            const result = await this.prisma.userNotification.updateMany({
                where: { userId, readAt: null },
                data: { readAt: new Date() },
            });
            this.gateway.emitNotificationsReadAll(userId);

            return {
                success: true,
                message: 'Notifications marked as read',
                data: {
                    updatedCount: result.count,
                },
            };
        } catch (error) {
            if (error instanceof HttpException) {
                throw error;
            }
            throw new InternalServerErrorException('Failed to mark notifications as read');
        }
    }

    async registerDeviceToken(userId: string, dto: RegisterDeviceTokenDto) {
        try {
            const token = await this.prisma.userDeviceToken.upsert({
                where: {
                    userId_deviceId: {
                        userId,
                        deviceId: dto.deviceId,
                    },
                },
                create: {
                    userId,
                    deviceId: dto.deviceId,
                    fcmToken: dto.fcmToken,
                    platform: this.toDevicePlatform(dto.platform),
                    isActive: true,
                    lastSeenAt: new Date(),
                },
                update: {
                    fcmToken: dto.fcmToken,
                    platform: this.toDevicePlatform(dto.platform),
                    isActive: true,
                    lastSeenAt: new Date(),
                },
            });

            await this.prisma.userDeviceToken.updateMany({
                where: {
                    id: { not: token.id },
                    fcmToken: dto.fcmToken,
                },
                data: { isActive: false },
            });

            return {
                success: true,
                message: 'Device token registered',
                data: {
                    deviceId: token.deviceId,
                    platform: token.platform,
                    isActive: token.isActive,
                    lastSeenAt: token.lastSeenAt,
                },
            };
        } catch (error) {
            if (error instanceof HttpException) {
                throw error;
            }
            throw new InternalServerErrorException('Failed to register device token');
        }
    }

    async disableDeviceToken(userId: string, deviceId: string) {
        try {
            const result = await this.prisma.userDeviceToken.updateMany({
                where: { userId, deviceId },
                data: { isActive: false },
            });

            return {
                success: true,
                message: 'Device token disabled',
                data: {
                    deviceId,
                    disabled: result.count > 0,
                },
            };
        } catch (error) {
            if (error instanceof HttpException) {
                throw error;
            }
            throw new InternalServerErrorException('Failed to disable device token');
        }
    }

    async createNotification(input: NotificationCreateInput) {
      assertNotificationDataForType(input.type, input.data);

      if (input.dedupeKey) {
        const existing = await this.prisma.userNotification.findUnique({
          where: {
            userId_dedupeKey: {
              userId: input.userId,
              dedupeKey: input.dedupeKey,
            },
          },
        });
        if (existing) {
          return existing;
        }
      }

        let notification: Prisma.UserNotificationModel;
        try {
          notification = await this.prisma.userNotification.create({
            data: {
                userId: input.userId,
                title: input.title,
                body: input.body,
                type: input.type,
                icon: input.icon ?? 'bell',
                data: (input.data ?? {}) as Prisma.InputJsonValue,
                dedupeKey: input.dedupeKey,
                expiresAt: input.expiresAt,
            },
          });
        } catch (error) {
          if (input.dedupeKey && this.isUniqueConflict(error)) {
            const existing = await this.prisma.userNotification.findUnique({
              where: {
                userId_dedupeKey: {
                  userId: input.userId,
                  dedupeKey: input.dedupeKey,
                },
              },
            });
            if (existing) {
              return existing;
            }
          }
          throw error;
        }

    try {
      await this.recordSocketDelivery(notification);
      await this.createFcmDeliveries(notification.id);
    } catch (error) {
      this.logger.error(
        `Notification ${notification.id} was saved but delivery scheduling failed: ${
          error instanceof Error ? error.message : String(error)
        }`,
        error instanceof Error ? error.stack : undefined,
      );
    }
        return notification;
    }

    async notifyScanProcessing(userId: string, scanId?: string) {
        return this.createNotification({
            userId,
            type: NotificationType.SCAN_PROCESSING,
            title: 'Hold tight!',
            body: 'Our AI is reviewing the menu and preparing personalized food recommendations for you.',
            data: scanId ? { scanId } : undefined,
            dedupeKey: scanId ? `scan:${scanId}:processing` : undefined,
        });
    }

    async notifyScanReady(userId: string, scanId: string) {
        return this.createNotification({
            userId,
            type: NotificationType.SCAN_RESULT_READY,
            title: 'Your Results Are Ready!',
            body: 'Check out recommended options tailored to your preferences.',
            data: { scanId },
            dedupeKey: `scan:${scanId}:ready`,
        });
    }

  emitReferralUpdated(
    userId: string,
    referredUserId: string,
    verifiedFriendsJoined: number,
  ): boolean {
    return this.gateway.emitReferralUpdated(userId, {
      referredUserId,
      verifiedFriendsJoined,
    });
  }

  async notifyScanFailed(userId: string, scanId: string, error: string) {
    return this.createNotification({
      userId,
      type: NotificationType.SCAN_FAILED,
      title: 'Scan could not be completed',
      body: "We couldn't analyze this menu. Please try again with a clearer photo or menu text.",
      data: {
        scanId,
        error,
      },
      dedupeKey: `scan:${scanId}:failed`,
    });
  }

    @Interval(60_000)
    async retryPendingDeliveries() {
        const now = new Date();
        const deliveries = await this.prisma.notificationDelivery.findMany({
            where: {
                channel: NotificationChannel.FCM,
                status: {
                    in: [
                        NotificationDeliveryStatus.PENDING,
                        NotificationDeliveryStatus.RETRYING,
                    ],
                },
                OR: [{ nextRetryAt: null }, { nextRetryAt: { lte: now } }],
            },
            include: {
                notification: true,
                deviceToken: true,
            },
            orderBy: { createdAt: 'asc' },
            take: RETRY_BATCH_SIZE,
        });

    for (const delivery of deliveries) {
      try {
        await this.sendFcmDelivery(delivery);
      } catch (error) {
        this.logger.error(
          `Failed retry for notification delivery ${delivery.id}: ${
            error instanceof Error ? error.message : String(error)
          }`,
          error instanceof Error ? error.stack : undefined,
        );
      }
        }
    }

    private async recordSocketDelivery(
        notification: Prisma.UserNotificationModel,
    ) {
        const card = this.mapCard(notification, new Date());
        const emitted = this.gateway.emitNotificationCreated(
            notification.userId,
            card,
        );

        await this.prisma.notificationDelivery.create({
            data: {
                notificationId: notification.id,
                userId: notification.userId,
                channel: NotificationChannel.SOCKET,
                status: emitted
                    ? NotificationDeliveryStatus.SENT
                    : NotificationDeliveryStatus.CANCELED,
                sentAt: emitted ? new Date() : undefined,
                lastError: emitted ? undefined : 'No active socket connection',
            },
        });
    }

    private async createFcmDeliveries(notificationId: string) {
        const notification = await this.prisma.userNotification.findUnique({
            where: { id: notificationId },
        });
        if (!notification) {
            return;
        }

        const deviceTokens = await this.prisma.userDeviceToken.findMany({
            where: {
                userId: notification.userId,
                isActive: true,
            },
        });

        for (const deviceToken of deviceTokens) {
            const delivery = await this.prisma.notificationDelivery.create({
                data: {
                    notificationId: notification.id,
                    userId: notification.userId,
                    deviceTokenId: deviceToken.id,
                    channel: NotificationChannel.FCM,
                    status: NotificationDeliveryStatus.PENDING,
                },
                include: {
                    notification: true,
                    deviceToken: true,
                },
            });
            await this.sendFcmDelivery(delivery);
        }
    }

    private async sendFcmDelivery(
        delivery: Prisma.NotificationDeliveryGetPayload<{
            include: { notification: true; deviceToken: true };
        }>,
    ) {
        if (!delivery.deviceToken?.isActive) {
            await this.prisma.notificationDelivery.update({
                where: { id: delivery.id },
                data: {
                    status: NotificationDeliveryStatus.CANCELED,
                    lastError: 'Device token is inactive',
                },
            });
            return;
        }

        const attemptCount = delivery.attemptCount + 1;
        const result = await this.fcm.send({
            token: delivery.deviceToken.fcmToken,
            title: delivery.notification.title,
            body: delivery.notification.body,
            data: this.buildFcmData(delivery.notification),
        });

        if (result.success) {
            await this.prisma.notificationDelivery.update({
                where: { id: delivery.id },
                data: {
                    status: NotificationDeliveryStatus.SENT,
                    attemptCount,
                    lastAttemptAt: new Date(),
                    sentAt: new Date(),
                    providerMessageId: result.providerMessageId,
                    lastError: null,
                    nextRetryAt: null,
                },
            });
            return;
        }

        if (result.invalidToken) {
            await this.prisma.userDeviceToken.update({
                where: { id: delivery.deviceToken.id },
                data: { isActive: false },
            });
        }

        const shouldRetry =
            !result.permanentFailure && attemptCount < MAX_RETRY_ATTEMPTS;
        await this.prisma.notificationDelivery.update({
            where: { id: delivery.id },
            data: {
                status: shouldRetry
                    ? NotificationDeliveryStatus.RETRYING
                    : NotificationDeliveryStatus.FAILED,
                attemptCount,
                lastAttemptAt: new Date(),
                lastError: result.error?.slice(0, 2000),
                nextRetryAt: shouldRetry
                    ? this.nextRetryAt(attemptCount)
                    : null,
            },
        });
    }

    private mapCard(
        notification: Prisma.UserNotificationModel,
        now: Date,
    ): NotificationCard {
        return {
            id: notification.id,
            type: toNotificationTypeApi(notification.type),
            title: notification.title,
            body: notification.body,
            icon: notification.icon,
            timeLabel: this.timeLabel(notification.createdAt, now),
            isRead: Boolean(notification.readAt),
            data: this.asRecord(notification.data),
        };
    }

    private groupCards(
        cards: NotificationCard[],
        rows: Prisma.UserNotificationModel[],
    ) {
        const sections = new Map<string, NotificationCard[]>();
        rows.forEach((row, index) => {
            const title = this.sectionTitle(row.createdAt);
            sections.set(title, [...(sections.get(title) ?? []), cards[index]]);
        });

        return Array.from(sections.entries()).map(([title, items]) => ({
            title,
            items,
        }));
    }

    private sectionTitle(date: Date): string {
        const now = new Date();
        if (date.toDateString() === now.toDateString()) {
            return 'Today';
        }

        const daysAgo = Math.floor(
            (this.startOfDay(now).getTime() - this.startOfDay(date).getTime()) /
            86_400_000,
        );
        return daysAgo < 7 ? 'This Week' : 'Earlier';
    }

    private timeLabel(date: Date, now: Date): string {
        const seconds = Math.max(0, Math.floor((now.getTime() - date.getTime()) / 1000));
        if (seconds < 60) {
            return 'Now';
        }
        const minutes = Math.floor(seconds / 60);
        if (minutes < 60) {
            return `${minutes}m ago`;
        }
        const hours = Math.floor(minutes / 60);
        if (hours < 24) {
            return `${hours}h ago`;
        }
        return `${Math.floor(hours / 24)}d ago`;
    }

    private startOfDay(date: Date): Date {
        return new Date(date.getFullYear(), date.getMonth(), date.getDate());
    }

    private nextRetryAt(attemptCount: number): Date {
        const delayMinutes = Math.min(60, 2 ** attemptCount);
        return new Date(Date.now() + delayMinutes * 60_000);
    }

    private buildFcmData(notification: Prisma.UserNotificationModel) {
        return {
            notificationId: notification.id,
            type: toNotificationTypeApi(notification.type),
            data: JSON.stringify(this.asRecord(notification.data)),
        };
    }

    private asRecord(value: Prisma.JsonValue): Record<string, unknown> {
        if (!value || typeof value !== 'object' || Array.isArray(value)) {
            return {};
        }
        return value as Record<string, unknown>;
    }

  private isUniqueConflict(error: unknown): boolean {
    return (
      typeof error === 'object' &&
      error !== null &&
      'code' in error &&
      (error as { code: unknown }).code === 'P2002'
    );
  }

    private toDevicePlatform(platform: DevicePlatformDto): DevicePlatform {
        switch (platform) {
            case DevicePlatformDto.IOS:
                return DevicePlatform.IOS;
            case DevicePlatformDto.WEB:
                return DevicePlatform.WEB;
            case DevicePlatformDto.ANDROID:
            default:
                return DevicePlatform.ANDROID;
        }
    }
}
