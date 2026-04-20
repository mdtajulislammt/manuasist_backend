import { Type } from 'class-transformer';
import { IsIn, IsInt, IsOptional, IsString, Min } from 'class-validator';

const spiceLevels = ['NONE', 'MILD', 'MEDIUM', 'HOT', 'EXTRA_HOT'] as const;
const weightGoals = ['LOSE', 'MAINTAIN', 'GAIN'] as const;

export class PatchPreferencesDto {
  @IsOptional()
  @IsString()
  dietType?: string;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  calorieTarget?: number;

  @IsOptional()
  @IsIn([...spiceLevels])
  spiceLevel?: (typeof spiceLevels)[number];

  @IsOptional()
  @IsIn([...weightGoals])
  weightGoal?: (typeof weightGoals)[number];
}
