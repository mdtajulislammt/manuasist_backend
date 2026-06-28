import { ApiProperty } from '@nestjs/swagger';

const spiceLevelEnum = [
  'NONE',
  'MILD',
  'MEDIUM',
  'HOT',
  'EXTRA_HOT',
] as const;

const weightGoalEnum = ['LOSE', 'MAINTAIN', 'GAIN'] as const;

export class PreferencesResponseDto {
  @ApiProperty({ format: 'uuid' })
  id!: string;

  @ApiProperty({ format: 'uuid' })
  userId!: string;

  @ApiProperty({ nullable: true })
  dietType!: string | null;

  @ApiProperty({ nullable: true, minimum: 0 })
  calorieTarget!: number | null;

  @ApiProperty({
    enum: ['preferences', 'onboarding_answer', 'computed'],
    nullable: true,
    required: false,
  })
  calorieTargetSource?: 'preferences' | 'onboarding_answer' | 'computed' | null;

  @ApiProperty({
    enum: spiceLevelEnum,
    nullable: true,
  })
  spiceLevel!: string | null;

  @ApiProperty({
    enum: weightGoalEnum,
    nullable: true,
  })
  weightGoal!: string | null;

  @ApiProperty({ format: 'date-time' })
  createdAt!: Date;

  @ApiProperty({ format: 'date-time' })
  updatedAt!: Date;
}
