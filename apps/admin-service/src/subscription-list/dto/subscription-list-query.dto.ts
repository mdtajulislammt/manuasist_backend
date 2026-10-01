import { ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsIn, IsInt, IsOptional, IsString, Max, Min } from 'class-validator';

export class SubscriptionListQueryDto {
  @ApiPropertyOptional({ example: 1, minimum: 1 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page?: number;

  @ApiPropertyOptional({ example: 20, minimum: 1, maximum: 100 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  limit?: number;

  @ApiPropertyOptional({
    enum: ['all', 'active', 'cancel', 'expired'],
    default: 'all',
  })
  @IsOptional()
  @IsIn(['all', 'active', 'cancel', 'expired'])
  status?: 'all' | 'active' | 'cancel' | 'expired';

  @ApiPropertyOptional({
    description: 'Search by user name, email, or phone',
    example: 'john@example.com',
  })
  @IsOptional()
  @IsString()
  q?: string;
}
