import { Module } from '@nestjs/common';
import { AdminInternalModule } from '../admin-internal/admin-internal.module';
import { ApplicationOnboardingController } from './application-onboarding.controller';

@Module({
  imports: [AdminInternalModule],
  controllers: [ApplicationOnboardingController],
})
export class ApplicationOnboardingModule {}
