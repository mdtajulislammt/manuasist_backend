import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsIn, IsOptional } from 'class-validator';
import {
  homeTrackingRanges,
  type HomeTrackingRange,
} from '../../home/dto/get-home-query.dto';
import {
  analyticsRanges,
  type AnalyticsRange,
} from './analytics-range-query.dto';

export class NaiScoreDashboardQueryDto {
  @ApiPropertyOptional({
    enum: analyticsRanges,
    default: 'today',
    example: 'today',
    description: 'Score summary and preview chart period',
  })
  @IsOptional()
  @IsIn([...analyticsRanges])
  period?: AnalyticsRange;

  @ApiPropertyOptional({
    enum: homeTrackingRanges,
    default: 'weekly',
    example: 'weekly',
    description: 'NAI tracking chart range',
  })
  @IsOptional()
  @IsIn([...homeTrackingRanges])
  trackingRange?: HomeTrackingRange;
}
