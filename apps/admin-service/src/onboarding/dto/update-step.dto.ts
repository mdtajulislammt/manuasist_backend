import { Type } from 'class-transformer';
import { ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsInt,
  IsObject,
  IsOptional,
  IsString,
  Min,
} from 'class-validator';

export class UpdateStepDto {
  @ApiPropertyOptional({
    description: 'Updated order index (0-based)',
    minimum: 0,
    example: 2,
  })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  orderIndex?: number;

  @ApiPropertyOptional({
    description: 'Updated step type',
    example: 'DIET',
  })
  @IsOptional()
  @IsString()
  type?: string;

  @ApiPropertyOptional({
    description: 'Updated step title',
    example: 'Choose dietary preferences',
  })
  @IsOptional()
  @IsString()
  title?: string;

  @ApiPropertyOptional({
    description: 'Updated step subtitle',
    example: 'We will tailor recommendations to your diet',
  })
  @IsOptional()
  @IsString()
  subtitle?: string;

  @ApiPropertyOptional({
    description: 'Updated UI config payload',
    type: 'object',
    additionalProperties: true,
    example: { kind: 'multi_select', options: ['vegetarian', 'vegan'] },
  })
  @IsOptional()
  @IsObject()
  uiConfig?: Record<string, unknown>;
}
