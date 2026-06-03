import { Public, Roles } from '@menu-assist/api-auth';
import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  UseGuards,
} from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiBody,
  ApiHeader,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
} from '@nestjs/swagger';
import { InternalApiKeyGuard } from '../internal-api-key.guard';
import { CreateSubscriptionPlanDto } from './dto/create-subscription-plan.dto';
import { CreateSubscriptionPriceDto } from './dto/create-subscription-price.dto';
import { UpdateSubscriptionPlanDto } from './dto/update-subscription-plan.dto';
import { UpdateSubscriptionPriceDto } from './dto/update-subscription-price.dto';
import { SubscriptionsService } from './subscriptions.service';

@Controller('subscriptions/plans')
@ApiTags('Admin Subscriptions')
@ApiBearerAuth()
@Roles('admin')
export class SubscriptionPlansController {
  constructor(private readonly subscriptions: SubscriptionsService) { }

  @Post()
  @ApiOperation({ summary: 'Create a subscription plan' })
  @ApiBody({ type: CreateSubscriptionPlanDto })
  @ApiOkResponse({ description: 'Subscription plan created.' })
  createPlan(@Body() dto: CreateSubscriptionPlanDto) {
    return this.subscriptions.createPlan(dto);
  }

  @Get()
  @ApiOperation({ summary: 'List subscription plans and price versions' })
  @ApiOkResponse({ description: 'Subscription plans returned.' })
  listPlans() {
    return this.subscriptions.listPlans();
  }

  @Get(':id')
  @ApiOperation({ summary: 'Get a subscription plan by id' })
  @ApiOkResponse({ description: 'Subscription plan returned.' })
  getPlan(@Param('id', ParseUUIDPipe) id: string) {
    return this.subscriptions.getPlan(id);
  }

  @Patch(':id')
  @ApiOperation({ summary: 'Update subscription plan metadata' })
  @ApiBody({ type: UpdateSubscriptionPlanDto })
  @ApiOkResponse({ description: 'Subscription plan updated.' })
  updatePlan(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateSubscriptionPlanDto,
  ) {
    return this.subscriptions.updatePlan(id, dto);
  }

  @Delete(':id')
  @ApiOperation({ summary: 'Archive a subscription plan' })
  @ApiOkResponse({ description: 'Subscription plan archived.' })
  deletePlan(@Param('id', ParseUUIDPipe) id: string) {
    return this.subscriptions.deletePlan(id);
  }
}

@Controller('subscriptions/prices')
@ApiTags('Admin Subscription Prices')
@ApiBearerAuth()
@Roles('admin')
export class SubscriptionPricesController {
  constructor(private readonly subscriptions: SubscriptionsService) { }

  @Post()
  @ApiOperation({ summary: 'Create a draft subscription price version' })
  @ApiBody({ type: CreateSubscriptionPriceDto })
  @ApiOkResponse({ description: 'Subscription price created.' })
  createPrice(@Body() dto: CreateSubscriptionPriceDto) {
    return this.subscriptions.createPrice(dto);
  }

  @Patch(':id')
  @ApiOperation({ summary: 'Update a draft subscription price version' })
  @ApiBody({ type: UpdateSubscriptionPriceDto })
  @ApiOkResponse({ description: 'Subscription price updated.' })
  updatePrice(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateSubscriptionPriceDto,
  ) {
    return this.subscriptions.updatePrice(id, dto);
  }

  @Delete(':id')
  @ApiOperation({ summary: 'Archive a subscription price version' })
  @ApiOkResponse({ description: 'Subscription price archived.' })
  deletePrice(@Param('id', ParseUUIDPipe) id: string) {
    return this.subscriptions.deletePrice(id);
  }

  @Post(':id/publish')
  @ApiOperation({
    summary: 'Publish a draft subscription price version',
    description:
      'Archives the previous published price for the plan. Existing subscribers keep their stored price snapshot until their next billing cycle.',
  })
  @ApiOkResponse({ description: 'Subscription price published or blocked.' })
  publishPrice(@Param('id', ParseUUIDPipe) id: string) {
    return this.subscriptions.publishPrice(id);
  }

  @Post(':id/sync-revenuecat')
  @ApiOperation({ summary: 'Sync a subscription price version to RevenueCat' })
  @ApiOkResponse({ description: 'RevenueCat sync attempted.' })
  syncRevenueCat(@Param('id', ParseUUIDPipe) id: string) {
    return this.subscriptions.syncRevenueCat(id);
  }
}

@Controller('internal/subscriptions')
@ApiTags('Internal Subscriptions')
@Public()
@UseGuards(InternalApiKeyGuard)
@ApiHeader({ name: 'x-internal-api-key', required: true })
export class InternalSubscriptionsController {
  constructor(private readonly subscriptions: SubscriptionsService) { }

  @Get('catalog/active')
  @ApiOperation({ summary: 'Get active published subscription catalog' })
  @ApiOkResponse({ description: 'Active subscription catalog returned.' })
  getActiveCatalog() {
    return this.subscriptions.getActiveCatalogForInternal();
  }

  @Get('prices/:id')
  @ApiOperation({ summary: 'Get subscription price by id' })
  @ApiOkResponse({ description: 'Subscription price returned.' })
  getPrice(@Param('id', ParseUUIDPipe) id: string) {
    return this.subscriptions.getPriceForInternal(id);
  }
}
