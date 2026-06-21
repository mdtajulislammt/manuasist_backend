import { BullModule } from '@nestjs/bullmq';
import { Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import Redis from 'ioredis';
import { AdminInternalModule } from '../admin-internal/admin-internal.module';
import { AuthInternalModule } from '../auth-internal/auth-internal.module';
import { ProfileFilesController } from './profile-files.controller';
import { ProfileAvatarStorageService } from './profile-avatar-storage.service';
import {
  PROFILE_CONTACT_CHANGE_OTP_QUEUE,
  REDIS_CLIENT,
} from './profile-contact-change.constants';
import { ProfileContactChangeOtpProcessor } from './profile-contact-change.processor';
import { ProfileContactChangeService } from './profile-contact-change.service';
import { UsersMeController } from './users-me.controller';
import { UsersMeService } from './users-me.service';

@Module({
  imports: [
    AdminInternalModule,
    AuthInternalModule,
    BullModule.registerQueue({
      name: PROFILE_CONTACT_CHANGE_OTP_QUEUE,
    }),
  ],
  controllers: [ProfileFilesController, UsersMeController],
  providers: [
    {
      provide: REDIS_CLIENT,
      inject: [ConfigService],
      useFactory: (config: ConfigService) =>
        new Redis(config.get<string>('REDIS_URL') ?? 'redis://127.0.0.1:6379', {
          maxRetriesPerRequest: null,
        }),
    },
    ProfileAvatarStorageService,
    ProfileContactChangeService,
    ProfileContactChangeOtpProcessor,
    UsersMeService,
  ],
  exports: [UsersMeService],
})
export class UsersMeModule {}
