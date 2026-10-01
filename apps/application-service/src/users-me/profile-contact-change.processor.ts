import { Processor, WorkerHost } from '@nestjs/bullmq';
import { Inject, Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Job } from 'bullmq';
import type Redis from 'ioredis';
import { AuthInternalClientService } from '../auth-internal/auth-internal-client.service';
import {
  PROFILE_CONTACT_CHANGE_OTP_QUEUE,
  profileContactChangeCooldownKey,
  profileContactChangePendingKey,
  REDIS_CLIENT,
} from './profile-contact-change.constants';
import type {
  ProfileContactChangeOtpJobData,
  ProfileContactChangePending,
} from './profile-contact-change.types';

@Processor(PROFILE_CONTACT_CHANGE_OTP_QUEUE)
@Injectable()
export class ProfileContactChangeOtpProcessor extends WorkerHost {
  private readonly resendCooldownSec: number;

  constructor(
    private readonly authInternal: AuthInternalClientService,
    @Inject(REDIS_CLIENT) private readonly redis: Redis,
    config: ConfigService,
  ) {
    super();
    this.resendCooldownSec =
      config.get<number>('CONTACT_CHANGE_OTP_RESEND_COOLDOWN_SECONDS') ?? 60;
  }

  async process(
    job: Job<ProfileContactChangeOtpJobData>,
  ): Promise<ProfileContactChangePending> {
    const { userId, kind, identifier } = job.data;
    const sent = await this.authInternal.requestContactChange(userId, {
      kind,
      identifier,
    });

    const pending: ProfileContactChangePending = {
      kind: sent.kind,
      identifier: sent.identifier,
      channel: sent.channel,
      status: 'OTP_SENT',
      expiresInSeconds: sent.expires_in_seconds,
      sentAt: new Date().toISOString(),
    };

    const ttl = Math.max(sent.expires_in_seconds, 1);
    await this.redis.set(
      profileContactChangePendingKey(userId, kind),
      JSON.stringify(pending),
      'EX',
      ttl,
    );
    await this.redis.set(
      profileContactChangeCooldownKey(userId, kind),
      '1',
      'EX',
      this.resendCooldownSec,
    );

    return pending;
  }
}
