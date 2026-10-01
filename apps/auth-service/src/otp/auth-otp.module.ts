import { BullModule } from '@nestjs/bullmq';
import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import Redis from 'ioredis';
import {
  AUTH_OTP_EMAIL_QUEUE,
  REDIS_CLIENT,
} from './auth-otp.constants';
import { AuthOtpEmailProcessor } from './auth-otp-email.processor';
import { OtpEmailService } from './otp-email.service';

@Module({
  imports: [
    ConfigModule,
    BullModule.registerQueue({
      name: AUTH_OTP_EMAIL_QUEUE,
    }),
  ],
  providers: [
    {
      provide: REDIS_CLIENT,
      inject: [ConfigService],
      useFactory: (config: ConfigService) =>
        new Redis(config.get<string>('REDIS_URL') ?? 'redis://127.0.0.1:6379', {
          maxRetriesPerRequest: null,
        }),
    },
    OtpEmailService,
    AuthOtpEmailProcessor,
  ],
  exports: [BullModule, REDIS_CLIENT, OtpEmailService],
})
export class AuthOtpModule {}
