import { Module } from '@nestjs/common';
import { PlatformFileStorageModule } from '../file-storage/platform-file-storage.module';
import {
  InternalOnboardingController,
  OnboardingFlowsController,
  OnboardingStepsController,
} from './onboarding-flows.controller';
import { OnboardingIconsController } from './onboarding-icons.controller';
import { OnboardingIconsService } from './onboarding-icons.service';
import { OnboardingFlowsService } from './onboarding-flows.service';
import { InternalApiKeyGuard } from '../internal-api-key.guard';

@Module({
  imports: [PlatformFileStorageModule],
  controllers: [
    OnboardingFlowsController,
    OnboardingStepsController,
    OnboardingIconsController,
    InternalOnboardingController,
  ],
  providers: [OnboardingFlowsService, OnboardingIconsService, InternalApiKeyGuard],
})
export class OnboardingModule {}
