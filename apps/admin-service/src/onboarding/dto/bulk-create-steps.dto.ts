import { Type } from 'class-transformer';
import { ApiProperty } from '@nestjs/swagger';
import { ArrayMinSize, IsArray, ValidateNested } from 'class-validator';
import { CreateStepDto } from './create-step.dto';

/** Wrapper shape for bulk step creation (`{ "steps": [...] }`). */
export class BulkCreateStepsDto {
  @ApiProperty({ type: [CreateStepDto] })
  @IsArray()
  @ArrayMinSize(1)
  @ValidateNested({ each: true })
  @Type(() => CreateStepDto)
  steps!: CreateStepDto[];
}
