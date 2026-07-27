import { ApiProperty } from '@nestjs/swagger';

const calorieTargetSourceEnum = [
  'preferences',
  'onboarding_answer',
  'computed',
] as const;

const calorieDataSourceEnum = ['meals', 'none'] as const;

const naiScoreDataSourceEnum = ['meals', 'scan', 'none'] as const;

export class HomeDailyIntakeDto {
  @ApiProperty()
  value!: number;

  @ApiProperty({ nullable: true, minimum: 0 })
  target!: number | null;

  @ApiProperty({ minimum: 0, maximum: 100 })
  progressPercent!: number;
}

export class HomeTodayNaiDto {
  @ApiProperty()
  title!: string;

  @ApiProperty({ nullable: true, minimum: 0, maximum: 100 })
  score!: number | null;

  @ApiProperty()
  scoreLabel!: string;

  @ApiProperty({ nullable: true })
  rating!: string | null;

  @ApiProperty()
  subtitle!: string;

  @ApiProperty({ nullable: true })
  changeText!: string | null;

  @ApiProperty({ type: HomeDailyIntakeDto })
  dailyIntake!: HomeDailyIntakeDto;
}

export class HomeNaiChartPointDto {
  @ApiProperty()
  label!: string;

  @ApiProperty({ format: 'date' })
  date!: string;

  @ApiProperty({ nullable: true, minimum: 0, maximum: 100 })
  score!: number | null;

  @ApiProperty()
  hasScan!: boolean;
}

export class HomeNaiTrackingDto {
  @ApiProperty({ enum: ['weekly', 'monthly'] })
  selectedRange!: string;

  @ApiProperty({ nullable: true })
  warning!: string | null;

  @ApiProperty()
  scoreLabel!: string;

  @ApiProperty({ type: [HomeNaiChartPointDto] })
  points!: HomeNaiChartPointDto[];
}

export class HomeNutritionProgressDto {
  @ApiProperty({ nullable: true, minimum: 0 })
  totalCaloriesNeeded!: number | null;

  @ApiProperty({ minimum: 0 })
  totalCaloriesConsumed!: number;

  @ApiProperty({ minimum: 0, maximum: 100 })
  progressPercent!: number;
}

export class HomeDataSourceDto {
  @ApiProperty({ enum: calorieDataSourceEnum })
  calories!: (typeof calorieDataSourceEnum)[number];

  @ApiProperty({ enum: naiScoreDataSourceEnum })
  naiScore!: (typeof naiScoreDataSourceEnum)[number];
}

export class HomeEmptyTodayNaiDto {
  @ApiProperty({ type: HomeDailyIntakeDto })
  dailyIntake!: HomeDailyIntakeDto;
}

export class HomeScreenDataDto {
  @ApiProperty({ nullable: true, minimum: 0 })
  calorieTarget!: number | null;

  @ApiProperty({
    enum: calorieTargetSourceEnum,
    nullable: true,
  })
  calorieTargetSource!: (typeof calorieTargetSourceEnum)[number] | null;

  @ApiProperty({ type: HomeDataSourceDto })
  dataSource!: HomeDataSourceDto;

  @ApiProperty({ type: HomeTodayNaiDto })
  todayNai!: HomeTodayNaiDto;

  @ApiProperty({ type: HomeNaiTrackingDto })
  naiTracking!: HomeNaiTrackingDto;

  @ApiProperty({ type: HomeEmptyTodayNaiDto, nullable: true })
  emptyTodayNai!: HomeEmptyTodayNaiDto | null;

  @ApiProperty({ type: HomeNutritionProgressDto })
  nutritionProgress!: HomeNutritionProgressDto;
}

export class HomeResponseDto {
  @ApiProperty()
  success!: boolean;

  @ApiProperty()
  message!: string;

  @ApiProperty({ type: HomeScreenDataDto })
  data!: HomeScreenDataDto;
}
