import { Type } from 'class-transformer';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsInt, IsNotEmpty, IsOptional, IsString, Min } from 'class-validator';

export class CreateReferralTierDto {
  @ApiProperty({ minimum: 1, example: 1 })
  @Type(() => Number)
  @IsInt()
  @Min(1)
  friendsRequired!: number;

  @ApiProperty({ example: '3 scans' })
  @IsString()
  @IsNotEmpty()
  rewardLabel!: string;

  @ApiPropertyOptional({ minimum: 0, example: 3 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  scanCredits?: number;

  @ApiPropertyOptional({ minimum: 0, example: 7 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  premiumDays?: number;

  @ApiProperty({ minimum: 1, example: 1 })
  @Type(() => Number)
  @IsInt()
  @Min(1)
  sortOrder!: number;
}
