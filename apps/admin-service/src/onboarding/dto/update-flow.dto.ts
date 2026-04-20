import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsIn, IsOptional, IsString } from 'class-validator';

const flowStatuses = ['DRAFT', 'PUBLISHED', 'ARCHIVED'] as const;

export class UpdateFlowDto {
  @ApiPropertyOptional({
    description: 'Updated flow name',
    example: 'default-onboarding-flow',
  })
  @IsOptional()
  @IsString()
  name?: string;

  @ApiPropertyOptional({
    description: 'Updated lifecycle status',
    enum: flowStatuses,
    example: 'DRAFT',
  })
  @IsOptional()
  @IsIn([...flowStatuses])
  status?: (typeof flowStatuses)[number];
}
