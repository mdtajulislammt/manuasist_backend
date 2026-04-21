import { ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsIn, IsInt, IsOptional, IsString, Min } from 'class-validator';

const spiceLevels = ['NONE', 'MILD', 'MEDIUM', 'HOT', 'EXTRA_HOT'] as const;
const weightGoals = ['LOSE', 'MAINTAIN', 'GAIN'] as const;

export class PatchPreferencesDto {
  @ApiPropertyOptional({ example: 'vegan' })
  @IsOptional()
  @IsString()
  dietType?: string;

  @ApiPropertyOptional({ minimum: 0, example: 2000 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  calorieTarget?: number;

  @ApiPropertyOptional({ enum: spiceLevels })
  @IsOptional()
  @IsIn([...spiceLevels])
  spiceLevel?: (typeof spiceLevels)[number];

  @ApiPropertyOptional({ enum: weightGoals })
  @IsOptional()
  @IsIn([...weightGoals])
  weightGoal?: (typeof weightGoals)[number];
}
