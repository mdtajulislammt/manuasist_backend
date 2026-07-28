import { Processor, WorkerHost } from '@nestjs/bullmq';
import { Injectable, Logger } from '@nestjs/common';
import { Job } from 'bullmq';
import {
  AUTH_OTP_EMAIL_QUEUE,
  type AuthOtpEmailJobData,
} from './auth-otp.constants';
import { OtpEmailService } from './otp-email.service';

@Processor(AUTH_OTP_EMAIL_QUEUE)
@Injectable()
export class AuthOtpEmailProcessor extends WorkerHost {
  private readonly logger = new Logger(AuthOtpEmailProcessor.name);

  constructor(private readonly otpEmail: OtpEmailService) {
    super();
  }

  async process(job: Job<AuthOtpEmailJobData>): Promise<void> {
    const { to, otp, purpose, expiresInSeconds } = job.data;
    this.logger.debug(
      `Sending ${purpose} OTP email to ${to} (job=${job.id}, attempt=${job.attemptsMade + 1})`,
    );
    await this.otpEmail.send({ to, otp, purpose, expiresInSeconds });
  }
}
