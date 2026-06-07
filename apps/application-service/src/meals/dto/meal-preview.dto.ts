import { MEAL_PORTION_FACTORS, MealSlot } from '@contracts/meals';
import { Type } from 'class-transformer';
import {
  IsEnum,
  IsIn,
  IsOptional,
  IsUUID,
  ValidateNested,
} from 'class-validator';
import { MealNutritionOverrideDto } from './meal-nutrition.dto';

export class MealPreviewDto {
  @IsUUID()
  dishId!: string;

  @IsIn(MEAL_PORTION_FACTORS)
  portionFactor!: number;

  @IsEnum(MealSlot)
  mealSlot!: MealSlot;

  @IsOptional()
  @ValidateNested()
  @Type(() => MealNutritionOverrideDto)
  nutrition?: MealNutritionOverrideDto;
}
