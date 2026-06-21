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

  @ApiProperty({
    description:
      'True when this user has a saved answer for this step at the active flow version',
  })
  completed!: boolean;

  @ApiProperty({
    nullable: true,
    description:
      'Saved answer for this step; use to pre-select options on screen (same shape as PUT /onboarding/answers value)',
    type: 'object',
    additionalProperties: true,
    example: { dietType: 'vegetarian' },
  })
  value!: unknown | null;
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

  @ApiProperty({
    description: 'Logged-in user progress percent (answered steps / total steps)',
    example: 33,
    minimum: 0,
    maximum: 100,
  })
  progress!: number;

  @ApiProperty({
    description: 'Number of steps the user has completed for this flow version',
    example: 2,
  })
  lastCompletedSteps!: number;
}
