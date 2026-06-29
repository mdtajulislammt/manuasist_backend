import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

const factorStatuses = [
  'Excellent',
  'Good',
  'Needs Work',
  'Fair',
  'No data',
] as const;
const colorKeys = ['green', 'yellow', 'red', 'grey'] as const;
const trackingRanges = ['daily', 'weekly', 'monthly'] as const;

export class NaiScoreSummaryDto {
  @ApiPropertyOptional({ nullable: true, minimum: 0, maximum: 100 })
  score!: number | null;

  @ApiPropertyOptional({ nullable: true, example: 'Good' })
  rating!: string | null;

  @ApiPropertyOptional({ nullable: true, minimum: 1, maximum: 99 })
  healthierThanPercent!: number | null;
}

export class NaiScoreBreakdownItemDto {
  @ApiProperty({ example: 'DC' })
  code!: string;

  @ApiProperty({ example: 'Diet Compliance (DC)' })
  title!: string;

  @ApiPropertyOptional({ nullable: true, minimum: 0, maximum: 100 })
  score!: number | null;

  @ApiProperty({ enum: factorStatuses })
  status!: string;

  @ApiProperty({ enum: colorKeys })
  colorKey!: string;
}

export class NaiTrackingPointDto {
  @ApiProperty({ example: '07' })
  label!: string;

  @ApiProperty({ format: 'date-time' })
  date!: string;

  @ApiPropertyOptional({ nullable: true, minimum: 0, maximum: 100 })
  score!: number | null;

  @ApiProperty()
  hasScan!: boolean;
}

export class NaiTrackingSectionDto {
  @ApiProperty({ enum: trackingRanges })
  selectedRange!: string;

  @ApiPropertyOptional({ nullable: true })
  warning!: string | null;

  @ApiProperty({ example: 'NAI Score: 88 - Good' })
  scoreLabel!: string;

  @ApiProperty({ type: [NaiTrackingPointDto] })
  points!: NaiTrackingPointDto[];
}

export class NaiCaloriesPreviewBarDto {
  @ApiProperty({ example: '07' })
  label!: string;

  @ApiProperty({ format: 'date-time' })
  date!: string;

  @ApiPropertyOptional({ nullable: true, minimum: 0, maximum: 100 })
  naiScore!: number | null;

  @ApiProperty()
  isToday!: boolean;
}

export class NaiCaloriesPreviewDto {
  @ApiProperty({ type: [Object] })
  chartLegend!: Array<{ slot: string; label: string; colorKey: string }>;

  @ApiProperty({ type: [NaiCaloriesPreviewBarDto] })
  dailyBars!: NaiCaloriesPreviewBarDto[];

  @ApiProperty({ type: [String] })
  insights!: string[];
}

export class NaiMacrosPreviewPointDto {
  @ApiProperty({ example: 'Wed' })
  label!: string;

  @ApiProperty({ format: 'date-time' })
  date!: string;

  @ApiProperty({ minimum: 0 })
  deviationPercent!: number;

  @ApiProperty()
  status!: string;
}

export class NaiMacrosPreviewDto {
  @ApiProperty({ type: [NaiMacrosPreviewPointDto] })
  chartPoints!: NaiMacrosPreviewPointDto[];

  @ApiPropertyOptional({ nullable: true })
  tip!: string | null;
}

export class NaiScoreDashboardDataDto {
  @ApiProperty({ example: 'today' })
  selectedPeriod!: string;

  @ApiProperty({ type: NaiScoreSummaryDto })
  summary!: NaiScoreSummaryDto;

  @ApiProperty()
  feedback!: string;

  @ApiProperty({ type: [NaiScoreBreakdownItemDto] })
  breakdown!: NaiScoreBreakdownItemDto[];

  @ApiProperty({ type: NaiTrackingSectionDto })
  naiTracking!: NaiTrackingSectionDto;

  @ApiProperty({ type: NaiCaloriesPreviewDto })
  caloriesPreview!: NaiCaloriesPreviewDto;

  @ApiProperty({ type: NaiMacrosPreviewDto })
  macrosPreview!: NaiMacrosPreviewDto;
}

export class NaiScoreDashboardResponseDto {
  @ApiProperty()
  success!: boolean;

  @ApiProperty()
  message!: string;

  @ApiProperty({ type: NaiScoreDashboardDataDto })
  data!: NaiScoreDashboardDataDto;
}
