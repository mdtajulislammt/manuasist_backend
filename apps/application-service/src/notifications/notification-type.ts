import { BadRequestException } from '@nestjs/common';
import {
  NotificationType as PrismaNotificationType,
} from '../../generated/prisma/enums';

/** Client-facing notification type strings (stable API contract). */
export const NotificationTypeApi = {
  SCAN_RESULT_READY: 'scan_result_ready',
  SCAN_PROCESSING: 'scan_processing',
  SCAN_FAILED: 'scan_failed',
  PROFILE_UPDATED: 'profile_updated',
  SUBSCRIPTION_RENEWED: 'subscription_renewed',
  SUBSCRIPTION_EXPIRED: 'subscription_expired',
  PROMOTION: 'promotion',
  SYSTEM: 'system',
} as const;

export type NotificationTypeApiValue =
  (typeof NotificationTypeApi)[keyof typeof NotificationTypeApi];

export const NOTIFICATION_TYPE_API_VALUES = Object.values(
  NotificationTypeApi,
) as NotificationTypeApiValue[];

const PRISMA_TO_API: Record<PrismaNotificationType, NotificationTypeApiValue> =
{
  [PrismaNotificationType.SYSTEM]: NotificationTypeApi.SYSTEM,
  [PrismaNotificationType.SCAN_PROCESSING]:
    NotificationTypeApi.SCAN_PROCESSING,
  [PrismaNotificationType.SCAN_RESULT_READY]:
    NotificationTypeApi.SCAN_RESULT_READY,
  [PrismaNotificationType.SCAN_FAILED]: NotificationTypeApi.SCAN_FAILED,
  [PrismaNotificationType.PROFILE_UPDATED]:
    NotificationTypeApi.PROFILE_UPDATED,
  [PrismaNotificationType.SUBSCRIPTION_RENEWED]:
    NotificationTypeApi.SUBSCRIPTION_RENEWED,
  [PrismaNotificationType.SUBSCRIPTION_EXPIRED]:
    NotificationTypeApi.SUBSCRIPTION_EXPIRED,
  [PrismaNotificationType.PROMOTION]: NotificationTypeApi.PROMOTION,
  [PrismaNotificationType.SCAN_READY]: NotificationTypeApi.SCAN_RESULT_READY,
  [PrismaNotificationType.DAILY_PROGRESS]: NotificationTypeApi.SYSTEM,
  [PrismaNotificationType.WEEKLY_PROGRESS]: NotificationTypeApi.SYSTEM,
  [PrismaNotificationType.REMINDER]: NotificationTypeApi.SYSTEM,
};

const API_TO_PRISMA: Record<
  NotificationTypeApiValue,
  PrismaNotificationType
> = {
  [NotificationTypeApi.SCAN_RESULT_READY]:
    PrismaNotificationType.SCAN_RESULT_READY,
  [NotificationTypeApi.SCAN_PROCESSING]: PrismaNotificationType.SCAN_PROCESSING,
  [NotificationTypeApi.SCAN_FAILED]: PrismaNotificationType.SCAN_FAILED,
  [NotificationTypeApi.PROFILE_UPDATED]: PrismaNotificationType.PROFILE_UPDATED,
  [NotificationTypeApi.SUBSCRIPTION_RENEWED]:
    PrismaNotificationType.SUBSCRIPTION_RENEWED,
  [NotificationTypeApi.SUBSCRIPTION_EXPIRED]:
    PrismaNotificationType.SUBSCRIPTION_EXPIRED,
  [NotificationTypeApi.PROMOTION]: PrismaNotificationType.PROMOTION,
  [NotificationTypeApi.SYSTEM]: PrismaNotificationType.SYSTEM,
};

const REQUIRED_DATA_KEYS: Partial<
  Record<NotificationTypeApiValue, readonly string[]>
> = {
  [NotificationTypeApi.SCAN_RESULT_READY]: ['scanId'],
  [NotificationTypeApi.SCAN_FAILED]: ['scanId'],
  [NotificationTypeApi.PROFILE_UPDATED]: ['profileId'],
  [NotificationTypeApi.SUBSCRIPTION_RENEWED]: ['subscriptionId'],
  [NotificationTypeApi.SUBSCRIPTION_EXPIRED]: ['subscriptionId'],
  [NotificationTypeApi.PROMOTION]: ['url'],
};

export function toNotificationTypeApi(
  type: PrismaNotificationType,
): NotificationTypeApiValue {
  return PRISMA_TO_API[type] ?? NotificationTypeApi.SYSTEM;
}

export function toPrismaNotificationType(
  type: NotificationTypeApiValue,
): PrismaNotificationType {
  return API_TO_PRISMA[type];
}

export function isNotificationTypeApiValue(
  value: string,
): value is NotificationTypeApiValue {
  return (NOTIFICATION_TYPE_API_VALUES as string[]).includes(value);
}

export function assertNotificationDataForType(
  type: PrismaNotificationType,
  data: Record<string, unknown> | undefined,
): void {
  const apiType = toNotificationTypeApi(type);
  const requiredKeys = REQUIRED_DATA_KEYS[apiType];
  if (!requiredKeys?.length) {
    return;
  }

  const payload = data ?? {};
  const missing = requiredKeys.filter((key) => {
    const value = payload[key];
    return typeof value !== 'string' || value.trim() === '';
  });

  if (missing.length > 0) {
    throw new BadRequestException(
      `Notification type "${apiType}" requires data fields: ${missing.join(', ')}`,
    );
  }
}
