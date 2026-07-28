import { InjectQueue } from '@nestjs/bullmq';
import {
  HttpException,
  HttpStatus,
  Inject,
  Injectable,
  InternalServerErrorException,
  Logger,
  OnModuleDestroy,
  OnModuleInit,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Queue, QueueEvents } from 'bullmq';
import type Redis from 'ioredis';
import type { ContactChangeKind } from '../auth-internal/auth-internal-client.service';
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

@Injectable()
export class ProfileContactChangeService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(ProfileContactChangeService.name);
  private queueEvents!: QueueEvents;

  constructor(
    @InjectQueue(PROFILE_CONTACT_CHANGE_OTP_QUEUE)
    private readonly queue: Queue<ProfileContactChangeOtpJobData>,
    @Inject(REDIS_CLIENT) private readonly redis: Redis,
    private readonly config: ConfigService,
  ) {}

  onModuleInit() {
    const url = this.config.get<string>('REDIS_URL') ?? 'redis://127.0.0.1:6379';
    this.queueEvents = new QueueEvents(PROFILE_CONTACT_CHANGE_OTP_QUEUE, {
      connection: { url, maxRetriesPerRequest: null },
    });
    this.queueEvents.on('error', (err) => {
      this.logger.error(`BullMQ queue events error: ${String(err)}`);
    });
  }

  async onModuleDestroy() {
    await this.queueEvents?.close();
  }

  private jobId(userId: string, kind: ContactChangeKind): string {
    return `send-otp:${userId}:${kind}`;
  }

  async assertCanSendOtp(userId: string, kind: ContactChangeKind): Promise<void> {
    const remaining = await this.redis.ttl(
      profileContactChangeCooldownKey(userId, kind),
    );
    if (remaining > 0) {
      throw new HttpException(
        `Please wait ${remaining} seconds before requesting another ${kind} verification code`,
        HttpStatus.TOO_MANY_REQUESTS,
      );
    }

    const existing = await this.queue.getJob(this.jobId(userId, kind));
    if (!existing) {
      return;
    }
    const state = await existing.getState();
    if (state === 'waiting' || state === 'active' || state === 'delayed') {
      throw new HttpException(
        `A ${kind} verification code request is already in progress`,
        HttpStatus.TOO_MANY_REQUESTS,
      );
    }
  }

  async requestOtp(
    userId: string,
    kind: ContactChangeKind,
    identifier: string,
  ): Promise<ProfileContactChangePending> {
    await this.assertCanSendOtp(userId, kind);

    const job = await this.queue.add(
      'send-otp',
      { userId, kind, identifier },
      {
        jobId: this.jobId(userId, kind),
        removeOnComplete: true,
        removeOnFail: 50,
      },
    );

    try {
      // Auth-service queues SMTP asynchronously, so this wait is DB/queue only
      // (not Gmail latency). Keeps exact expires_in / error semantics for clients.
      await this.queueEvents.waitUntilReady();
      const result = await job.waitUntilFinished(
        this.queueEvents,
        15_000,
      );
      return result as ProfileContactChangePending;
    } catch (error) {
      this.logger.error(
        `Profile contact-change OTP job failed for user ${userId}: ${String(error)}`,
      );
      throw new InternalServerErrorException('Failed to send verification code');
    }
  }

  async clearPending(userId: string, kind: ContactChangeKind): Promise<void> {
    await this.redis.del(
      profileContactChangePendingKey(userId, kind),
      profileContactChangeCooldownKey(userId, kind),
    );
    const job = await this.queue.getJob(this.jobId(userId, kind));
    if (job) {
      await job.remove();
    }
  }

  async getPendingForUser(
    userId: string,
  ): Promise<Partial<Record<ContactChangeKind, ProfileContactChangePending>>> {
    const result: Partial<
      Record<ContactChangeKind, ProfileContactChangePending>
    > = {};
    for (const kind of ['email', 'phone'] as const) {
      const raw = await this.redis.get(profileContactChangePendingKey(userId, kind));
      if (!raw) {
        continue;
      }
      try {
        result[kind] = JSON.parse(raw) as ProfileContactChangePending;
      } catch {
        await this.redis.del(profileContactChangePendingKey(userId, kind));
      }
    }
    return result;
  }
}
