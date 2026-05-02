import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsOptional, IsUUID } from 'class-validator';
import { TransformQueryFirstStringTrim } from './icon-query.transforms';

export class DeleteOnboardingIconQueryDto {
  @ApiPropertyOptional({
    description: 'If set, step must belong to a DRAFT flow.',
    format: 'uuid',
  })
  @IsOptional()
  @TransformQueryFirstStringTrim()
  @IsUUID()
  stepId?: string;
}
