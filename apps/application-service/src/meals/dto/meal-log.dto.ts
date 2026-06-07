import { IsDateString, IsOptional } from 'class-validator';
import { MealPreviewDto } from './meal-preview.dto';

export class MealLogDto extends MealPreviewDto {
  @IsOptional()
  @IsDateString()
  loggedAt?: string;
}
