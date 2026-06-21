import type { ContactChangeKind } from '../auth-internal/auth-internal-client.service';

export type ProfileContactChangePending = {
  kind: ContactChangeKind;
  identifier: string;
  channel: 'email' | 'sms';
  status: 'OTP_SENT';
  expiresInSeconds: number;
  sentAt: string;
};

export type ProfileContactChangeOtpJobData = {
  userId: string;
  kind: ContactChangeKind;
  identifier: string;
};
