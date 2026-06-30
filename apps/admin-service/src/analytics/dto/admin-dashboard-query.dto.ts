import { ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsIn, IsInt, IsOptional, Min } from 'class-validator';

export const adminRevenuePeriods = ['this_month', 'last_month', 'year'] as const;
export type AdminRevenuePeriod = (typeof adminRevenuePeriods)[number];

export class AdminDashboardQueryDto {
  @ApiPropertyOptional({
    enum: adminRevenuePeriods,
    default: 'year',
    example: 'this_month',
    description: 'Revenue chart period filter',
  })
  @IsOptional()
  @IsIn([...adminRevenuePeriods])
  revenuePeriod?: AdminRevenuePeriod;

  @ApiPropertyOptional({ default: 1, minimum: 1 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  subscriptionPage?: number;

  @ApiPropertyOptional({ default: 10, minimum: 1 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  subscriptionLimit?: number;

  @ApiPropertyOptional({ default: 10, minimum: 1 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  topUsersLimit?: number;
}
