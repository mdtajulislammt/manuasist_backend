import { Type } from 'class-transformer';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsArray,
  IsDateString,
  IsIn,
  IsInt,
  IsNotEmpty,
  IsOptional,
  IsString,
  IsUUID,
  Min,
} from 'class-validator';

const intervals = ['WEEK', 'MONTH', 'YEAR'] as const;

export class CreateSubscriptionPriceDto {
  @ApiProperty({ format: 'uuid' })
  @IsUUID()
  planId!: string;

  @ApiPropertyOptional({
    description: 'If omitted, the next version for the plan is used',
    minimum: 1,
  })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  version?: number;

  @ApiProperty({ description: 'Price in minor units, e.g. cents', example: 299 })
  @Type(() => Number)
  @IsInt()
  @Min(0)
  amountMinor!: number;

  @ApiProperty({ example: 'USD' })
  @IsString()
  @IsNotEmpty()
  currency!: string;

  @ApiProperty({ example: '$2.99' })
  @IsString()
  @IsNotEmpty()
  priceLabel!: string;

  @ApiProperty({ example: 'Per Month' })
  @IsString()
  @IsNotEmpty()
  billingPeriodLabel!: string;

  @ApiProperty({ enum: intervals, example: 'MONTH' })
  @IsString()
  @IsIn([...intervals])
  interval!: (typeof intervals)[number];

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

  @ApiPropertyOptional({
    description: 'RevenueCat/store product identifiers to attach or map',
    type: [String],
  })
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  revenueCatProductIds?: string[];

  @ApiPropertyOptional({ example: '2026-06-01T00:00:00.000Z' })
  @IsOptional()
  @IsDateString()
  effectiveFrom?: string;
}
