import { Module } from '@nestjs/common';
import { InternalApiKeyGuard } from '../internal-api-key.guard';
import {
  InternalReferralsController,
  ReferralOffersController,
  ReferralTiersController,
} from './referrals.controller';
import { ReferralsService } from './referrals.service';

@Module({
  controllers: [
    ReferralOffersController,
    ReferralTiersController,
    InternalReferralsController,
  ],
  providers: [ReferralsService, InternalApiKeyGuard],
})
export class ReferralsModule {}
