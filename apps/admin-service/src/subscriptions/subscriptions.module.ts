import { Module } from '@nestjs/common';
import { InternalApiKeyGuard } from '../internal-api-key.guard';
import {
  InternalSubscriptionsController,
  SubscriptionPlansController,
  SubscriptionPricesController,
} from './subscriptions.controller';
import { SubscriptionsService } from './subscriptions.service';

@Module({
  controllers: [
    SubscriptionPlansController,
    SubscriptionPricesController,
    InternalSubscriptionsController,
  ],
  providers: [SubscriptionsService, InternalApiKeyGuard],
})
export class SubscriptionsModule {}
