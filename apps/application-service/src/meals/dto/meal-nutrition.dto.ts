import { Type } from 'class-transformer';
import {
  IsInt,
  IsNumber,
  IsOptional,
  Max,
  Min,
  ValidateNested,
} from 'class-validator';

export class MealNutritionOverrideDto {
  @IsOptional()
  @IsInt()
  @Min(50)
  @Max(5000)
  calories?: number;

  @IsOptional()
  @IsNumber()
  @Min(0)
  @Max(500)
  proteinG?: number;

  @IsOptional()
  @IsNumber()
  @Min(0)
  @Max(500)
  carbG?: number;

  @IsOptional()
  @IsNumber()
  @Min(0)
  @Max(500)
  fatG?: number;
}
