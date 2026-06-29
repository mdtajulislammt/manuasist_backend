import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

const mealSlots = ['BREAKFAST', 'LUNCH', 'DINNER', 'SNACKS'] as const;
const calorieBarStatuses = ['under', 'over', 'on_track', 'no_data'] as const;

export class CaloriesScoreChartLegendItemDto {
  @ApiProperty({ enum: mealSlots })
  slot!: (typeof mealSlots)[number];

  @ApiProperty({ example: 'Breakfast' })
  label!: string;

  @ApiProperty({ example: 'breakfast' })
  colorKey!: string;
}

export class CaloriesScoreChartBarDto {
  @ApiProperty({ example: '08' })
  label!: string;

  @ApiProperty({ format: 'date' })
  date!: string;

  @ApiProperty({ enum: mealSlots, nullable: true })
  mealSlot!: (typeof mealSlots)[number] | null;

  @ApiProperty({ example: 'breakfast' })
  colorKey!: string;

  @ApiProperty({ nullable: true, minimum: 0, maximum: 100 })
  naiScore!: number | null;

  @ApiProperty({ minimum: 0 })
  calories!: number;

  @ApiProperty({ nullable: true, minimum: 0 })
  slotCalorieTarget!: number | null;

  @ApiProperty({ nullable: true })
  deltaFromSlotTarget!: number | null;

  @ApiProperty()
  isToday!: boolean;

  @ApiProperty({ enum: calorieBarStatuses })
  status!: (typeof calorieBarStatuses)[number];
}

export class CaloriesScoreSummaryDto {
  @ApiProperty({ nullable: true, minimum: 0 })
  caloriesNeeded!: number | null;

  @ApiProperty({ minimum: 0 })
  caloriesEaten!: number;
}

export class CaloriesScoreMealSuggestionDto {
  @ApiProperty({ enum: mealSlots })
  slot!: (typeof mealSlots)[number];

  @ApiProperty({ minimum: 0 })
  suggestedCalories!: number;
}

export class CaloriesScoreDataDto {
  @ApiProperty({ enum: ['today', 'week', 'month'] })
  selectedRange!: string;

  @ApiProperty({ type: [CaloriesScoreChartLegendItemDto] })
  chartLegend!: CaloriesScoreChartLegendItemDto[];

  @ApiProperty({ type: [CaloriesScoreChartBarDto] })
  chartBars!: CaloriesScoreChartBarDto[];

  @ApiProperty({ type: CaloriesScoreSummaryDto })
  summary!: CaloriesScoreSummaryDto;

  @ApiProperty({ type: [CaloriesScoreMealSuggestionDto] })
  mealSuggestions!: CaloriesScoreMealSuggestionDto[];

  @ApiPropertyOptional({ nullable: true })
  scoreTip!: string | null;
}

export class CaloriesScoreResponseDto {
  @ApiProperty()
  success!: boolean;

  @ApiProperty()
  message!: string;

  @ApiProperty({ type: CaloriesScoreDataDto })
  data!: CaloriesScoreDataDto;
}
