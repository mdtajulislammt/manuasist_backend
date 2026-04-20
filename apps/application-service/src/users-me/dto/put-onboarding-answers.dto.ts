import { Allow, IsArray, IsInt, IsUUID, ValidateNested } from 'class-validator';
import { Type } from 'class-transformer';

export class OnboardingAnswerItemDto {
  @IsUUID()
  stepKey!: string;

  @Allow()
  value?: unknown;
}

export class PutOnboardingAnswersDto {
  @IsInt()
  flowVersion!: number;

  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => OnboardingAnswerItemDto)
  answers!: OnboardingAnswerItemDto[];
}
