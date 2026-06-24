import { ApiProperty } from '@nestjs/swagger';

/** Next incomplete step (by order); client can resume the wizard here. */
export class OnboardingResumeNextStepDto {
  @ApiProperty({ format: 'uuid' })
  id!: string;

  @ApiProperty()
  orderIndex!: number;

  @ApiProperty({
    description:
      'Wizard position percent for this step (computed from orderIndex and total steps)',
    example: 33,
    minimum: 0,
    maximum: 100,
  })
  progressPercent!: number;

  @ApiProperty()
  title!: string;

  @ApiProperty({ nullable: true })
  subtitle!: string | null;

  @ApiProperty({
    nullable: true,
    description: 'Same shape as steps in GET /onboarding/active-flow',
    type: 'object',
    additionalProperties: true,
  })
  uiConfig!: Record<string, unknown> | null;
}

export class OnboardingProgressDataDto {
  @ApiProperty({ description: 'Active published flow version; use with PUT /onboarding/answers' })
  flowVersion!: number;

  @ApiProperty({ format: 'uuid' })
  flowId!: string;

  @ApiProperty()
  flowName!: string;

  @ApiProperty({
    description: 'All steps in the flow (e.g. 6 in “2 of 6 preferences”)',
    example: 6,
  })
  totalSteps!: number;

  @ApiProperty({
    description: 'Steps with a saved answer for this flowVersion',
    example: 2,
  })
  answeredSteps!: number;

  @ApiProperty({
    description: 'Count of steps marked required in uiConfig (default required if omitted)',
    example: 6,
  })
  requiredTotal!: number;

  @ApiProperty({
    description: 'Required steps already answered',
    example: 2,
  })
  answeredRequiredSteps!: number;

  @ApiProperty({
    description:
      'Rounded percent for UI (e.g. NAI personalization): answeredSteps / totalSteps, 0–100',
    example: 33,
    minimum: 0,
    maximum: 100,
  })
  personalizationPercent!: number;

  @ApiProperty({ type: [String], format: 'uuid' })
  completedStepIds!: string[];

  @ApiProperty({ type: [String], format: 'uuid' })
  pendingStepIds!: string[];

  @ApiProperty({
    type: OnboardingResumeNextStepDto,
    nullable: true,
    description: 'First unanswered step in flow order; null if done or empty flow',
  })
  nextStep!: OnboardingResumeNextStepDto | null;

  @ApiProperty({
    description: 'True when profile.onboardingCompletedAt is set (all required steps were answered)',
  })
  onboardingCompleted!: boolean;

  @ApiProperty({ nullable: true, format: 'date-time' })
  onboardingCompletedAt!: Date | null;

  @ApiProperty({
    description:
      'True when the user can continue: not fully completed and there is a next step',
  })
  canResume!: boolean;
}

export class OnboardingProgressResponseDto {
  @ApiProperty()
  success!: boolean;

  @ApiProperty()
  message!: string;

  @ApiProperty({ type: OnboardingProgressDataDto })
  data!: OnboardingProgressDataDto;
}
