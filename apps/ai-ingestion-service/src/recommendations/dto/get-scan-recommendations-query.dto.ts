import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsEnum, IsOptional } from 'class-validator';

export enum RecommendationCategoryFilter {
  ALL = 'ALL',
  RECOMMENDED = 'RECOMMENDED',
  CAUTION = 'CAUTION',
  AVOID = 'AVOID',
}

export enum RecommendationSort {
  BEST_MATCH = 'best_match',
  HEALTH_SCORE = 'health_score',
  CALORIES = 'calories',
}

export class GetScanRecommendationsQueryDto {
  @ApiPropertyOptional({
    description: 'Filter cards by recommendation category',
    enum: RecommendationCategoryFilter,
    default: RecommendationCategoryFilter.ALL,
  })
  @IsOptional()
  @IsEnum(RecommendationCategoryFilter)
  category?: RecommendationCategoryFilter;

  @ApiPropertyOptional({
    description: 'Sort recommendation cards',
    enum: RecommendationSort,
    default: RecommendationSort.BEST_MATCH,
    example: RecommendationSort.BEST_MATCH,
  })
  @IsOptional()
  @IsEnum(RecommendationSort)
  sort?: RecommendationSort;
}
