import { Module } from '@nestjs/common';
import {
  InternalOnboardingController,
  OnboardingFlowsController,
  OnboardingStepsController,
} from './onboarding-flows.controller';
import { OnboardingFlowsService } from './onboarding-flows.service';
import { InternalApiKeyGuard } from '../internal-api-key.guard';

@Module({
  controllers: [
    OnboardingFlowsController,
    OnboardingStepsController,
    InternalOnboardingController,
  ],
  providers: [OnboardingFlowsService, InternalApiKeyGuard],
})
export class OnboardingModule {}
