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
import { AnalyticsService } from '../analytics/analytics.service';
import { IngestionInternalApiKeyGuard } from './internal-api-key.guard';

@Controller('internal/analytics')
@ApiTags('Internal — analytics')
@Public()
@UseGuards(IngestionInternalApiKeyGuard)
@ApiHeader({ name: 'x-internal-api-key', required: true })
@ApiUnauthorizedResponse({ description: 'Invalid or missing internal API key' })
export class InternalAnalyticsController {
  constructor(private readonly analytics: AnalyticsService) {}

  @Get('dashboard')
  @ApiOperation({ summary: 'Platform scan totals and top users (internal)' })
  @ApiQuery({ name: 'topUsersLimit', required: false, example: 10 })
  @ApiOkResponse({ description: 'Dashboard scan stats returned.' })
  async getDashboard(
    @Query('topUsersLimit') topUsersLimit?: string,
  ) {
    const limit = topUsersLimit ? Number.parseInt(topUsersLimit, 10) : 10;
    const data = await this.analytics.getDashboardStats(
      Number.isNaN(limit) ? 10 : limit,
    );
    return {
      success: true,
      message: 'Ingestion dashboard analytics retrieved',
      data,
    };
  }
}
