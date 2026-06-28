import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsIn, IsOptional } from 'class-validator';

export const analyticsRanges = ['today', 'week', 'month'] as const;
export type AnalyticsRange = (typeof analyticsRanges)[number];

export class AnalyticsRangeQueryDto {
  @ApiPropertyOptional({
    enum: analyticsRanges,
    default: 'week',
    example: 'week',
  })
  @IsOptional()
  @IsIn([...analyticsRanges])
  range?: AnalyticsRange;
}
