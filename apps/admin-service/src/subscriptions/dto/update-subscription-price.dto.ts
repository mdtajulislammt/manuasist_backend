import { Type } from 'class-transformer';
import { ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsArray,
  IsDateString,
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  Min,
} from 'class-validator';

const intervals = ['WEEK', 'MONTH', 'YEAR'] as const;

export class UpdateSubscriptionPriceDto {
  @ApiPropertyOptional({ minimum: 0 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  amountMinor?: number;

  @ApiPropertyOptional({ example: 'USD' })
  @IsOptional()
  @IsString()
  currency?: string;

  @ApiPropertyOptional({ example: '$2.99' })
  @IsOptional()
  @IsString()
  priceLabel?: string;

  @ApiPropertyOptional({ example: 'Per Month' })
  @IsOptional()
  @IsString()
  billingPeriodLabel?: string;

  @ApiPropertyOptional({ enum: intervals })
  @IsOptional()
  @IsString()
  @IsIn([...intervals])
  interval?: (typeof intervals)[number];

  @ApiPropertyOptional({ example: 14 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  trialDays?: number;

  @ApiPropertyOptional({ example: 'premium' })
  @IsOptional()
  @IsString()
  revenueCatEntitlementId?: string;

  @ApiPropertyOptional({ example: 'default' })
  @IsOptional()
  @IsString()
  revenueCatOfferingId?: string;

  @ApiPropertyOptional({ example: '$rc_monthly' })
  @IsOptional()
  @IsString()
  revenueCatPackageId?: string;

  @ApiPropertyOptional({ type: [String] })
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  revenueCatProductIds?: string[];

  @ApiPropertyOptional({ example: '2026-06-01T00:00:00.000Z' })
  @IsOptional()
  @IsDateString()
  effectiveFrom?: string;
}
