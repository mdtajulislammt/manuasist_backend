import { Module } from '@nestjs/common';
import { AdminInternalModule } from '../admin-internal/admin-internal.module';
import { UsersMeModule } from '../users-me/users-me.module';
import { ApplicationOnboardingController } from './application-onboarding.controller';

@Module({
  imports: [AdminInternalModule, UsersMeModule],
  controllers: [ApplicationOnboardingController],
})
export class ApplicationOnboardingModule {}
