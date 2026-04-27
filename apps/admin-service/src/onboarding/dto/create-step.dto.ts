import { Type } from 'class-transformer';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsInt,
  IsNotEmpty,
  IsObject,
  IsOptional,
  IsString,
  Min,
} from 'class-validator';

export class CreateStepDto {
  @ApiProperty({
    description: 'Order index within the flow (0-based)',
    minimum: 0,
    example: 1,
  })
  @Type(() => Number)
  @IsInt()
  @Min(0)
  orderIndex!: number;

  @ApiProperty({
    description: 'Step type key',
    example: 'GOAL',
  })
  @IsString()
  @IsNotEmpty()
  type!: string;

  @ApiProperty({
    description: 'Step title shown to user',
    example: 'Set your primary goal',
  })
  @IsString()
  @IsNotEmpty()
  title!: string;

  @ApiPropertyOptional({
    description: 'Optional step subtitle',
    example: 'Weight loss, maintenance, or muscle gain',
  })
  @IsOptional()
  @IsString()
  subtitle?: string;

  @ApiPropertyOptional({
    description: 'Optional UI config payload',
    type: 'object',
    additionalProperties: true,
    example: { kind: 'single_select', options: ['lose', 'maintain', 'gain'] },
  })
  @IsOptional()
  @IsObject()
  uiConfig?: Record<string, unknown>;
}
