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
}
