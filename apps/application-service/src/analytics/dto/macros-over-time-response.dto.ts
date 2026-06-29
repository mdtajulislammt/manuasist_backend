import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

const macroStatuses = ['within_goal', 'slightly_off', 'out_of_range'] as const;
const analyticsRanges = ['today', 'week', 'month'] as const;

export class MacrosChartLegendItemDto {
  @ApiProperty({ enum: macroStatuses })
  status!: (typeof macroStatuses)[number];

  @ApiProperty({ example: 'Within goal' })
  label!: string;

  @ApiProperty({ example: 'green' })
  colorKey!: string;
}

export class MacrosChartPointDto {
  @ApiProperty({ example: '10am' })
  label!: string;

  @ApiProperty({ format: 'date-time' })
  date!: string;

  @ApiPropertyOptional({ nullable: true, minimum: 0 })
  deviationPercent!: number | null;

  @ApiProperty({ enum: macroStatuses })
  status!: (typeof macroStatuses)[number];
}

export class MacroDistributionCardDto {
  @ApiProperty({ minimum: 0, maximum: 100 })
  percent!: number;

  @ApiProperty({ enum: macroStatuses })
  status!: (typeof macroStatuses)[number];

  @ApiProperty({ example: '52% - Perfect balance today!' })
  label!: string;
}

export class MacrosTodayDistributionDto {
  @ApiProperty({ type: MacroDistributionCardDto })
  carbs!: MacroDistributionCardDto;

  @ApiProperty({ type: MacroDistributionCardDto })
  fat!: MacroDistributionCardDto;

  @ApiProperty({ type: MacroDistributionCardDto })
  protein!: MacroDistributionCardDto;
}

export class MacroGoalSplitDto {
  @ApiProperty({ example: 50 })
  carbPercent!: number;

  @ApiProperty({ example: 30 })
  fatPercent!: number;

  @ApiProperty({ example: 20 })
  proteinPercent!: number;
}

export class MacroInsightDto {
  @ApiProperty({ example: 'restaurant_fat' })
  kind!: string;

  @ApiProperty({ example: 'warning' })
  severity!: string;

  @ApiProperty()
  text!: string;

  @ApiPropertyOptional()
  tip?: string;
}

export class MacrosOverTimeDataDto {
  @ApiProperty({ enum: analyticsRanges })
  selectedRange!: string;

  @ApiProperty({ example: "Today's Distribution vs. Goal" })
  chartTitle!: string;

  @ApiProperty({ example: 'Your Today Insight' })
  insightTitle!: string;

  @ApiProperty({ type: [MacrosChartLegendItemDto] })
  chartLegend!: MacrosChartLegendItemDto[];

  @ApiProperty({ type: [MacrosChartPointDto] })
  chartPoints!: MacrosChartPointDto[];

  @ApiProperty({ type: MacroGoalSplitDto })
  goalSplit!: MacroGoalSplitDto;

  @ApiProperty({ type: MacrosTodayDistributionDto })
  todayDistribution!: MacrosTodayDistributionDto;

  @ApiProperty({ type: [MacroInsightDto] })
  insights!: MacroInsightDto[];
}

export class MacrosOverTimeResponseDto {
  @ApiProperty()
  success!: boolean;

  @ApiProperty()
  message!: string;

  @ApiProperty({ type: MacrosOverTimeDataDto })
  data!: MacrosOverTimeDataDto;
}
