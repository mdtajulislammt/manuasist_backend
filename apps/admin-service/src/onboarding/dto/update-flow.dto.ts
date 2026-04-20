import { IsIn, IsOptional, IsString } from 'class-validator';

const flowStatuses = ['DRAFT', 'PUBLISHED', 'ARCHIVED'] as const;

export class UpdateFlowDto {
  @IsOptional()
  @IsString()
  name?: string;

  @IsOptional()
  @IsIn([...flowStatuses])
  status?: (typeof flowStatuses)[number];
}
