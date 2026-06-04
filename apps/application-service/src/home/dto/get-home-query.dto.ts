import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsIn, IsOptional } from 'class-validator';

export const homeTrackingRanges = ['daily', 'weekly', 'monthly'] as const;
export type HomeTrackingRange = (typeof homeTrackingRanges)[number];

export class GetHomeQueryDto {
  @ApiPropertyOptional({
    description: 'Tracking chart range',
    enum: homeTrackingRanges,
    default: 'weekly',
    example: 'weekly',
  })
  @IsOptional()
  @IsIn([...homeTrackingRanges])
  trackingRange?: HomeTrackingRange;
}
