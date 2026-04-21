import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Allow, IsArray, IsInt, IsUUID, ValidateNested } from 'class-validator';
import { Type } from 'class-transformer';

export class OnboardingAnswerItemDto {
  @ApiProperty({
    format: 'uuid',
    description: 'Step id from the active published flow (matches step.id)',
  })
  @IsUUID()
  stepKey!: string;

  @ApiPropertyOptional({
    description: 'Answer payload; shape depends on step type',
    example: { dietType: 'vegetarian', calorieTarget: 1800 },
  })
  @Allow()
  value?: unknown;
}

export class PutOnboardingAnswersDto {
  @ApiProperty({
    description: 'Must match the active flow version from GET .../onboarding/active-flow',
    example: 1,
  })
  @IsInt()
  flowVersion!: number;

  @ApiProperty({ type: [OnboardingAnswerItemDto] })
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => OnboardingAnswerItemDto)
  answers!: OnboardingAnswerItemDto[];
}
