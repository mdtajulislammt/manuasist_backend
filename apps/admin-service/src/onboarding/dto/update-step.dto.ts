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
    description:
      'Updated UI config (JSON). Same `kind` rules as create step; optional `icon` per card option and per `multi_slider` field. See `steps.txt` for examples.',
    type: 'object',
    additionalProperties: true,
    example: {
      kind: 'multi_select_cards',
      selection: {
        mode: 'multiple',
        required: false,
        minSelections: 0,
        maxSelections: 10,
      },
      options: [{ value: 'dairy', label: 'Dairy / Milk', icon: 'dairy' }],
      defaultValues: ['dairy'],
    },
  })
  @IsOptional()
  @IsObject()
  uiConfig?: Record<string, unknown>;
}
