import { Controller, Get, Query } from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
} from '@nestjs/swagger';
import { Roles } from '@menu-assist/api-auth';
import { AnalyticsService } from './analytics.service';
import { AdminDashboardQueryDto } from './dto/admin-dashboard-query.dto';

@Controller('analytics')
@ApiTags('Admin Analytics')
@ApiBearerAuth('JWT-auth')
@Roles('admin')
export class AnalyticsController {
  constructor(private readonly analytics: AnalyticsService) {}

  @Get('dashboard')
  @ApiOperation({
    summary: 'Admin dashboard analytics (KPIs, revenue chart, top users, subscriptions)',
  })
  @ApiOkResponse({ description: 'Dashboard analytics returned.' })
  getDashboard(@Query() query: AdminDashboardQueryDto) {
    return this.analytics.getDashboard(query);
  }
}
