import { Type } from 'class-transformer';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsInt,
  IsNotEmpty,
  IsObject,
  IsOptional,
  IsString,
  IsUUID,
  Min,
} from 'class-validator';

export class CreateStepDto {
  @ApiPropertyOptional({
    description:
      'Existing step id. When set, updates that step instead of creating a new one.',
    format: 'uuid',
  })
  @IsOptional()
  @IsUUID()
  id?: string;

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
    description:
      'UI config (JSON). Supported `kind` values: single_select | multi_slider | single_select_cards | multi_select_cards | multi_scale. ' +
      'Field keys (`fields[].key`) and option values (`options[].value`) are auto-generated from labels when omitted. ' +
      'For card kinds, each option may include optional `icon` (string: asset key or image URL). See repo `steps.txt` for full payload examples.',
    type: 'object',
    additionalProperties: true,
    example: {
      kind: 'single_select_cards',
      selection: { mode: 'single', required: true },
      options: [
        { value: 'weight_loss', label: 'Weight Loss', icon: 'weight_loss' },
        { value: 'gain_energy', label: 'Gain Energy' },
      ],
      defaultValue: 'weight_loss',
    },
  })
  @IsOptional()
  @IsObject()
  uiConfig?: Record<string, unknown>;
}
