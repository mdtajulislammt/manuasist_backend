import { Controller, Get, Query, UnauthorizedException } from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
  ApiUnauthorizedResponse,
} from '@nestjs/swagger';
import { CurrentUserId } from '../decorators/current-user-id.decorator';
import { AnalyticsService } from './analytics.service';
import { AnalyticsRangeQueryDto } from './dto/analytics-range-query.dto';
import { CaloriesScoreResponseDto } from './dto/calories-score-response.dto';
import { MacrosOverTimeResponseDto } from './dto/macros-over-time-response.dto';
import { NaiScoreDashboardResponseDto } from './dto/nai-score-dashboard-response.dto';
import { NaiScoreDashboardQueryDto } from './dto/nai-score-dashboard-query.dto';

@Controller('analytics')
@ApiTags('Analytics')
@ApiBearerAuth()
@ApiUnauthorizedResponse({ description: 'Missing or invalid Bearer token' })
export class AnalyticsController {
  constructor(private readonly analytics: AnalyticsService) {}

  @Get('good-weeks-vs-off-weeks')
  @ApiOperation({ summary: 'Good weeks vs off weeks NAI pattern (last 6 weeks)' })
  @ApiOkResponse({ description: 'Good weeks analytics returned.' })
  getGoodWeeks(@CurrentUserId() userId: string | undefined) {
    return this.analytics.getGoodWeeksVsOffWeeks(this.requireUserId(userId));
  }

  @Get('calories-score')
  @ApiOperation({ summary: 'NAI calories score chart and daily calorie summary' })
  @ApiOkResponse({
    type: CaloriesScoreResponseDto,
    description: 'Calories score analytics returned.',
  })
  getCaloriesScore(
    @CurrentUserId() userId: string | undefined,
    @Query() query: AnalyticsRangeQueryDto,
  ) {
    return this.analytics.getCaloriesScore(this.requireUserId(userId), query);
  }

  @Get('macros-over-time')
  @ApiOperation({ summary: 'Macro distribution and deviation over time' })
  @ApiOkResponse({
    type: MacrosOverTimeResponseDto,
    description: 'Macros analytics returned.',
  })
  getMacrosOverTime(
    @CurrentUserId() userId: string | undefined,
    @Query() query: AnalyticsRangeQueryDto,
  ) {
    return this.analytics.getMacrosOverTime(this.requireUserId(userId), query);
  }

  @Get('restaurant-habits')
  @ApiOperation({ summary: 'Restaurant visit frequency and scan patterns' })
  @ApiOkResponse({ description: 'Restaurant habits analytics returned.' })
  getRestaurantHabits(
    @CurrentUserId() userId: string | undefined,
    @Query() query: AnalyticsRangeQueryDto,
  ) {
    return this.analytics.getRestaurantHabits(this.requireUserId(userId), query);
  }

  @Get('most-consumed-cuisines')
  @ApiOperation({ summary: 'Weekly cuisine calorie contribution breakdown' })
  @ApiOkResponse({ description: 'Cuisine analytics returned.' })
  getMostConsumedCuisines(
    @CurrentUserId() userId: string | undefined,
    @Query() query: AnalyticsRangeQueryDto,
  ) {
    return this.analytics.getMostConsumedCuisines(
      this.requireUserId(userId),
      query,
    );
  }

  @Get('nai-score-dashboard')
  @ApiOperation({
    summary: 'My NAI Score dashboard (summary, breakdown, tracking, previews)',
  })
  @ApiOkResponse({
    type: NaiScoreDashboardResponseDto,
    description: 'NAI score dashboard returned.',
  })
  getNaiScoreDashboard(
    @CurrentUserId() userId: string | undefined,
    @Query() query: NaiScoreDashboardQueryDto,
  ) {
    return this.analytics.getNaiScoreDashboard(this.requireUserId(userId), query);
  }

  private requireUserId(userId: string | undefined): string {
    if (!userId) {
      throw new UnauthorizedException('User id missing from token');
    }
    return userId;
  }
}
