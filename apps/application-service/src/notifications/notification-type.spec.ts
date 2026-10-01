import { BadRequestException } from '@nestjs/common';
import { NotificationType } from '../../generated/prisma/enums';
import {
  assertNotificationDataForType,
  toNotificationTypeApi,
} from './notification-type';

describe('notification-type', () => {
  it('maps legacy SCAN_READY to scan_result_ready', () => {
    expect(toNotificationTypeApi(NotificationType.SCAN_READY)).toBe(
      'scan_result_ready',
    );
  });

  it('maps SCAN_RESULT_READY to scan_result_ready', () => {
    expect(toNotificationTypeApi(NotificationType.SCAN_RESULT_READY)).toBe(
      'scan_result_ready',
    );
  });

  it('maps SCAN_FAILED to scan_failed', () => {
    expect(toNotificationTypeApi(NotificationType.SCAN_FAILED)).toBe(
      'scan_failed',
    );
  });

  it('requires scanId for scan_result_ready', () => {
    expect(() =>
      assertNotificationDataForType(NotificationType.SCAN_RESULT_READY, {}),
    ).toThrow(BadRequestException);
  });

  it('allows scan_processing without required data keys', () => {
    expect(() =>
      assertNotificationDataForType(NotificationType.SCAN_PROCESSING, {}),
    ).not.toThrow();
  });
});
