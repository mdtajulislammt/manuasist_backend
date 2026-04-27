import { ApiProperty } from '@nestjs/swagger';

export class AdminOnboardingStepResponseDto {
  @ApiProperty({ format: 'uuid' })
  id!: string;

  @ApiProperty({ format: 'uuid' })
  flowId!: string;

  @ApiProperty()
  orderIndex!: number;

  @ApiProperty({ description: 'Step type key (e.g. single_choice, multi_choice)' })
  type!: string;

  @ApiProperty()
  title!: string;

  @ApiProperty({ nullable: true })
  subtitle!: string | null;

  @ApiProperty({
    nullable: true,
    description: 'UI hints (options, required flag, etc.)',
    type: 'object',
    additionalProperties: true,
  })
  uiConfig!: Record<string, unknown> | null;

  @ApiProperty({ format: 'date-time' })
  createdAt!: string;

  @ApiProperty({ format: 'date-time' })
  updatedAt!: string;
}

export class AdminActiveFlowResponseDto {
  @ApiProperty({ format: 'uuid' })
  id!: string;

  @ApiProperty()
  name!: string;

  @ApiProperty({ description: 'Flow lifecycle status (e.g. PUBLISHED)' })
  status!: string;

  @ApiProperty()
  version!: number;

  @ApiProperty()
  isActive!: boolean;

  @ApiProperty({ nullable: true, format: 'date-time' })
  publishedAt!: string | null;

  @ApiProperty({ format: 'date-time' })
  createdAt!: string;

  @ApiProperty({ format: 'date-time' })
  updatedAt!: string;

  @ApiProperty({ type: [AdminOnboardingStepResponseDto] })
  steps!: AdminOnboardingStepResponseDto[];
}
