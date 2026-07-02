import { Public } from '@menu-assist/api-auth';
import { Controller, Get, Query, UseGuards } from '@nestjs/common';
import {
  ApiHeader,
  ApiOkResponse,
  ApiOperation,
  ApiQuery,
  ApiTags,
  ApiUnauthorizedResponse,
} from '@nestjs/swagger';
import { InternalApiKeyGuard } from '../internal-api-key.guard';
import {
  InternalAnalyticsService,
  type AdminRevenuePeriod,
  type SubscriptionListStatusFilter,
} from './internal-analytics.service';

@Controller('internal/analytics')
@ApiTags('Internal — analytics')
@Public()
@UseGuards(InternalApiKeyGuard)
@ApiHeader({ name: 'x-internal-api-key', required: true })
@ApiUnauthorizedResponse({ description: 'Invalid or missing internal API key' })
export class InternalAnalyticsController {
  constructor(private readonly analytics: InternalAnalyticsService) {}

  @Get('dashboard')
  @ApiOperation({
    summary: 'Revenue chart and recent subscriptions for admin dashboard',
  })
  @ApiQuery({
    name: 'revenuePeriod',
    required: false,
    enum: ['this_month', 'last_month', 'year'],
  })
  @ApiQuery({ name: 'subscriptionPage', required: false, example: 1 })
  @ApiQuery({ name: 'subscriptionLimit', required: false, example: 10 })
  @ApiOkResponse({ description: 'Application dashboard analytics returned.' })
  async getDashboard(
    @Query('revenuePeriod') revenuePeriod?: AdminRevenuePeriod,
    @Query('subscriptionPage') subscriptionPage?: string,
    @Query('subscriptionLimit') subscriptionLimit?: string,
  ) {
    const page = subscriptionPage
      ? Number.parseInt(subscriptionPage, 10)
      : undefined;
    const limit = subscriptionLimit
      ? Number.parseInt(subscriptionLimit, 10)
      : undefined;

    const data = await this.analytics.getDashboardStats({
      revenuePeriod,
      subscriptionPage: page && !Number.isNaN(page) ? page : 1,
      subscriptionLimit: limit && !Number.isNaN(limit) ? limit : 10,
    });

    return {
      success: true,
      message: 'Application dashboard analytics retrieved',
      data,
    };
  }

  @Get('subscriptions')
  @ApiOperation({ summary: 'Paginated subscriber entitlements for admin list' })
  @ApiQuery({ name: 'page', required: false, example: 1 })
  @ApiQuery({ name: 'limit', required: false, example: 20 })
  @ApiQuery({
    name: 'status',
    required: false,
    enum: ['all', 'active', 'cancel', 'expired'],
  })
  @ApiQuery({
    name: 'userIds',
    required: false,
    description: 'Comma-separated auth user UUIDs to filter',
  })
  @ApiOkResponse({ description: 'Subscription list returned.' })
  async listSubscriptions(
    @Query('page') page?: string,
    @Query('limit') limit?: string,
    @Query('status') status?: SubscriptionListStatusFilter,
    @Query('userIds') userIds?: string,
  ) {
    const parsedPage = page ? Number.parseInt(page, 10) : undefined;
    const parsedLimit = limit ? Number.parseInt(limit, 10) : undefined;
    const parsedUserIds = userIds
      ? userIds
          .split(',')
          .map((id) => id.trim())
          .filter(Boolean)
      : undefined;

    const data = await this.analytics.listSubscriptions({
      page: parsedPage && !Number.isNaN(parsedPage) ? parsedPage : 1,
      limit: parsedLimit && !Number.isNaN(parsedLimit) ? parsedLimit : 20,
      status: status ?? 'all',
      userIds: parsedUserIds,
    });

    return {
      success: true,
      message: 'Subscription list retrieved',
      data,
    };
  }
}
