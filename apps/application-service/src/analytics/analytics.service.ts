import {
  HttpException,
  Injectable,
  InternalServerErrorException,
} from '@nestjs/common';
import { MealSlot } from '../../generated/prisma/enums';
import { MealsService } from '../meals/meals.service';
import { MembershipService } from '../membership/membership.service';
import { DietaryPreferencesResolver } from '../users-me/dietary-preferences.resolver';
import { AiIngestionAnalyticsClientService } from './ai-ingestion-analytics-client.service';
import type { AnalyticsRangeQueryDto } from './dto/analytics-range-query.dto';
import {
  GOOD_WEEK_NAI_THRESHOLD,
  buildRangeBuckets,
  formatIsoDate,
  lastNWeeks,
  resolveRangeWindow,
  scanVisitBuckets,
  todayMacroTimeBuckets,
  utcDayStart,
} from './utils/analytics-date.util';
import {
  buildDailyMetricsMap,
  computeDailyNaiFromMeals,
  getDailyMetrics,
  macroDeviationPercent,
  macroPercents,
  macroStatus,
  summarizeMacroRange,
  DEFAULT_MACRO_GOAL,
  type DailyMetrics,
  type MealMetricRow,
  type AnalyticsScan,
} from './utils/daily-metrics.util';
import {
  aggregateCuisineCalories,
  buildCuisineRows,
  buildHighlightedMeals,
  perCuisineTargetLine,
} from './utils/cuisine-aggregation.util';
import {
  buildCalorieInsights,
  buildCuisineInsight,
  buildMacroInsights,
  buildOffWeekInsights,
  buildRestaurantInsights,
  type AnalyticsInsight,
} from './utils/insights.engine';

const MEAL_SLOT_RATIOS: Record<MealSlot, number> = {
  BREAKFAST: 0.25,
  LUNCH: 0.3,
  DINNER: 0.3,
  SNACKS: 0.15,
};

const CALORIES_SCORE_CHART_LEGEND = [
  { slot: MealSlot.BREAKFAST, label: 'Breakfast', colorKey: 'breakfast' },
  { slot: MealSlot.LUNCH, label: 'Lunch', colorKey: 'lunch' },
  { slot: MealSlot.SNACKS, label: 'Snacks', colorKey: 'snacks' },
  { slot: MealSlot.DINNER, label: 'Dinner', colorKey: 'dinner' },
] as const;

const MACRO_CHART_LEGEND = [
  { status: 'within_goal', label: 'Within goal', colorKey: 'green' },
  { status: 'slightly_off', label: 'Slightly off', colorKey: 'orange' },
  { status: 'out_of_range', label: 'Out of range', colorKey: 'red' },
] as const;

@Injectable()
export class AnalyticsService {
  constructor(
    private readonly membership: MembershipService,
    private readonly meals: MealsService,
    private readonly dietary: DietaryPreferencesResolver,
    private readonly ingestion: AiIngestionAnalyticsClientService,
  ) {}

  async getGoodWeeksVsOffWeeks(userId: string) {
    await this.membership.assertPremiumAccess(userId);
    try {
      const weeks = lastNWeeks(6);
      const from = weeks[0].weekStart;
      const to = weeks[weeks.length - 1].weekEnd;
      const { meals, scans, dishNamesById } = await this.loadContext(
        userId,
        from,
        to,
      );
      const dailyMap = buildDailyMetricsMap(meals, scans);

      const weekRows = weeks.map((week) => {
        const dailyScores: number[] = [];
        for (
          let cursor = new Date(week.weekStart);
          cursor < week.weekEnd;
          cursor.setUTCDate(cursor.getUTCDate() + 1)
        ) {
          const metrics = getDailyMetrics(dailyMap, cursor);
          if (metrics.naiScore !== null) {
            dailyScores.push(metrics.naiScore);
          }
        }
        const averageNai =
          dailyScores.length > 0
            ? Math.round(
                dailyScores.reduce((sum, score) => sum + score, 0) /
                  dailyScores.length,
              )
            : null;
        const status =
          averageNai === null
            ? 'no_data'
            : averageNai >= GOOD_WEEK_NAI_THRESHOLD
              ? 'good'
              : 'off';
        return {
          label: week.label,
          weekStart: formatIsoDate(week.weekStart),
          isCurrentWeek: week.isCurrentWeek,
          averageNai,
          status,
        };
      });

      const scoredWeeks = weekRows.filter((week) => week.averageNai !== null);
      const bestWeek = scoredWeeks.reduce<(typeof weekRows)[number] | null>(
        (best, week) =>
          !best || (week.averageNai ?? 0) > (best.averageNai ?? 0)
            ? week
            : best,
        null,
      );

      const offWeekLabels = new Set(
        weekRows
          .filter((week) => week.status === 'off')
          .map((week) => week.label),
      );
      const offWeekMeals = meals.filter((meal) =>
        this.mealInWeekLabels(meal.mealDate, weeks, offWeekLabels),
      );

      const insights = buildOffWeekInsights({
        offWeekMeals,
        offWeekCount: offWeekLabels.size,
        dishNamesById,
      });

      const worstOffWeek = weekRows
        .filter((week) => week.status === 'off')
        .sort((a, b) => (a.averageNai ?? 0) - (b.averageNai ?? 0))[0];
      const potentialGainNai = worstOffWeek
        ? Math.max(0, GOOD_WEEK_NAI_THRESHOLD - (worstOffWeek.averageNai ?? 0))
        : null;

      return {
        success: true,
        message: 'Good weeks vs off weeks retrieved successfully',
        data: {
          weeks: weekRows,
          threshold: GOOD_WEEK_NAI_THRESHOLD,
          bestWeek: bestWeek
            ? { label: bestWeek.label, averageNai: bestWeek.averageNai }
            : null,
          insights,
          potentialGainNai,
        },
      };
    } catch (error) {
      throw this.wrapError(error, 'Failed to get good weeks analytics');
    }
  }

  async getCaloriesScore(userId: string, query: AnalyticsRangeQueryDto) {
    await this.membership.assertPremiumAccess(userId);
    try {
      const range = query.range ?? 'week';
      const { from, to } = resolveRangeWindow(range);
      const [dietary, context] = await Promise.all([
        this.dietary.resolve(userId),
        this.loadContext(userId, from, to),
      ]);
      const dailyMap = buildDailyMetricsMap(context.meals, context.scans);
      const calorieTarget = dietary.calorieTarget;
      const chartDays =
        range === 'today'
          ? [utcDayStart(new Date())]
          : buildRangeBuckets(range).map((bucket) => bucket.start);

      const chartBars = this.buildCaloriesScoreChartBars(
        context.meals,
        dailyMap,
        chartDays,
        calorieTarget,
      );

      const today = utcDayStart(new Date());
      const todayMetrics = getDailyMetrics(dailyMap, today);
      const todayMeals = context.meals.filter(
        (meal) => formatIsoDate(meal.mealDate) === formatIsoDate(today),
      );
      const mealSuggestions = this.buildMealSuggestions(
        calorieTarget,
        todayMeals,
      );
      const insights = buildCalorieInsights({
        meals: context.meals,
        calorieTarget,
      });
      const remaining =
        calorieTarget === null
          ? null
          : Math.max(0, calorieTarget - todayMetrics.calories);
      const scoreTip =
        remaining !== null && remaining > 0
          ? `To hit 100 CB score, you need to add today's calorie intake by ${remaining} kcal`
          : null;

      return {
        success: true,
        message: 'Calories score analytics retrieved successfully',
        data: {
          selectedRange: range,
          chartLegend: CALORIES_SCORE_CHART_LEGEND,
          chartBars,
          summary: {
            caloriesNeeded: calorieTarget,
            caloriesEaten: todayMetrics.calories,
          },
          mealSuggestions,
          insights,
          scoreTip,
        },
      };
    } catch (error) {
      throw this.wrapError(error, 'Failed to get calories score analytics');
    }
  }

  async getMacrosOverTime(userId: string, query: AnalyticsRangeQueryDto) {
    await this.membership.assertPremiumAccess(userId);
    try {
      const range = query.range ?? 'week';
      const { from, to } = resolveRangeWindow(range);
      const context = await this.loadContext(userId, from, to);
      const dailyMap = buildDailyMetricsMap(context.meals, context.scans);

      const chartPoints =
        range === 'today'
          ? this.buildTodayMacroChartPoints(context.meals, context.scans)
          : this.buildRangeMacroChartPoints(dailyMap, range);

      const todayMetrics = getDailyMetrics(dailyMap, utcDayStart(new Date()));
      const todayPercents = macroPercents(
        todayMetrics.proteinG,
        todayMetrics.carbG,
        todayMetrics.fatG,
      );
      const todayDistribution = {
        carbs: this.macroCard(
          todayPercents.carbPercent,
          DEFAULT_MACRO_GOAL.carbPercent,
          'carbs',
        ),
        fat: this.macroCard(
          todayPercents.fatPercent,
          DEFAULT_MACRO_GOAL.fatPercent,
          'fat',
        ),
        protein: this.macroCard(
          todayPercents.proteinPercent,
          DEFAULT_MACRO_GOAL.proteinPercent,
          'protein',
        ),
      };

      const hasLoggedData =
        range === 'today'
          ? todayMetrics.dataSource !== 'none'
          : summarizeMacroRange(
              dailyMap,
              range === 'month' ? 'month' : 'week',
            ).loggedDayCount > 0;

      const todayKey = formatIsoDate(utcDayStart(new Date()));
      const scanDayDates = new Set(
        context.scans.map((scan) => formatIsoDate(scan.scanTime)),
      );
      const todayHasScan = scanDayDates.has(todayKey);
      const todayMetricsEntry = dailyMap.get(todayKey);
      const todayHighFat =
        todayHasScan &&
        todayMetricsEntry !== undefined &&
        todayMetricsEntry.dataSource !== 'none' &&
        macroPercents(
          todayMetricsEntry.proteinG,
          todayMetricsEntry.carbG,
          todayMetricsEntry.fatG,
        ).fatPercent > DEFAULT_MACRO_GOAL.fatPercent + 10;

      const insights =
        range === 'today'
          ? buildMacroInsights({
              scanDayCount: todayHasScan ? 1 : 0,
              highFatScanDays: todayHighFat ? 1 : 0,
              period: 'today',
              hasLoggedData,
              todayDistribution: {
                carbs: {
                  percent: todayDistribution.carbs.percent,
                  status: todayDistribution.carbs.status,
                },
                fat: {
                  percent: todayDistribution.fat.percent,
                  status: todayDistribution.fat.status,
                },
                protein: {
                  percent: todayDistribution.protein.percent,
                  status: todayDistribution.protein.status,
                },
              },
              chartPoints,
            })
          : buildMacroInsights({
              scanDayCount: scanDayDates.size,
              highFatScanDays: [...dailyMap.entries()].filter(
                ([date, metrics]) => {
                  if (!scanDayDates.has(date) || metrics.dataSource === 'none') {
                    return false;
                  }
                  const percents = macroPercents(
                    metrics.proteinG,
                    metrics.carbG,
                    metrics.fatG,
                  );
                  return (
                    percents.fatPercent > DEFAULT_MACRO_GOAL.fatPercent + 10
                  );
                },
              ).length,
              period: 'range',
              hasLoggedData,
              todayDistribution: {
                carbs: {
                  percent: todayDistribution.carbs.percent,
                  status: todayDistribution.carbs.status,
                },
                fat: {
                  percent: todayDistribution.fat.percent,
                  status: todayDistribution.fat.status,
                },
                protein: {
                  percent: todayDistribution.protein.percent,
                  status: todayDistribution.protein.status,
                },
              },
              chartPoints,
              rangeSummary:
                range === 'month'
                  ? summarizeMacroRange(dailyMap, 'month')
                  : summarizeMacroRange(dailyMap, 'week'),
            });

      const chartTitle =
        range === 'today'
          ? "Today's Distribution vs. Goal"
          : range === 'week'
            ? 'Weekly Distribution vs. Goal'
            : 'Monthly Distribution vs. Goal';
      const insightTitle =
        range === 'today'
          ? 'Your Today Insight'
          : range === 'week'
            ? 'Your Weekly Insight'
            : 'Your Monthly Insight';

      return {
        success: true,
        message: 'Macros over time analytics retrieved successfully',
        data: {
          selectedRange: range,
          chartTitle,
          insightTitle,
          chartLegend: MACRO_CHART_LEGEND,
          chartPoints,
          goalSplit: DEFAULT_MACRO_GOAL,
          todayDistribution,
          insights,
        },
      };
    } catch (error) {
      throw this.wrapError(error, 'Failed to get macros analytics');
    }
  }

  async getRestaurantHabits(userId: string, query: AnalyticsRangeQueryDto) {
    await this.membership.assertPremiumAccess(userId);
    try {
      const range = query.range ?? 'week';
      const { from, to } = resolveRangeWindow(range);
      const scans = await this.ingestion.getCompletedScans(userId, from, to);
      const buckets = scanVisitBuckets(range);

      const visitFrequency = buckets.map((bucket) => ({
        label: bucket.label,
        date: bucket.date,
        visits: scans.filter(
          (scan) =>
            scan.scanTime >= bucket.start && scan.scanTime < bucket.end,
        ).length,
      }));

      let heavyCategoryCount = 0;
      let healthyCategoryCount = 0;
      for (const scan of scans) {
        for (const dish of scan.dishes) {
          if (dish.category === 'AVOID' || dish.category === 'CAUTION') {
            heavyCategoryCount += 1;
          } else if (dish.category === 'RECOMMENDED') {
            healthyCategoryCount += 1;
          }
        }
      }

      const insights = buildRestaurantInsights({
        heavyCategoryCount,
        healthyCategoryCount,
      });

      return {
        success: true,
        message: 'Restaurant habits analytics retrieved successfully',
        data: {
          selectedRange: range,
          visitFrequency,
          insights,
          mostVisitedRestaurants: [],
          restaurantDetailsAvailable: false,
          comingSoonMessage:
            'Restaurant names and addresses will be available in a future update.',
        },
      };
    } catch (error) {
      throw this.wrapError(error, 'Failed to get restaurant habits analytics');
    }
  }

  async getMostConsumedCuisines(userId: string, query: AnalyticsRangeQueryDto) {
    await this.membership.assertPremiumAccess(userId);
    try {
      const range = query.range ?? 'week';
      const { from, to } = resolveRangeWindow(range);
      const [dietary, context] = await Promise.all([
        this.dietary.resolve(userId),
        this.loadContext(userId, from, to),
      ]);

      const cuisineItems = [
        ...context.meals.map((meal) => ({
          name: context.dishNamesById.get(meal.dishId) ?? 'Logged meal',
          calories: meal.calories,
        })),
        ...context.scans.flatMap((scan) =>
          scan.dishes.map((dish) => ({
            name: dish.name,
            calories: dish.calories,
          })),
        ),
      ];

      const totals = aggregateCuisineCalories(cuisineItems);
      const totalCalories = cuisineItems.reduce(
        (sum, item) => sum + item.calories,
        0,
      );
      const weeklyTarget =
        dietary.calorieTarget === null
          ? null
          : dietary.calorieTarget * (range === 'month' ? 30 : range === 'week' ? 7 : 1);
      const targetLineCalories = perCuisineTargetLine(
        weeklyTarget,
        Math.max(totals.size, 1),
      );
      const cuisines = buildCuisineRows(
        totals,
        totalCalories,
        targetLineCalories,
      );
      const dominantTag = cuisines[0]?.tag ?? null;
      const insights: AnalyticsInsight[] = [];
      const dominantInsight = buildCuisineInsight({
        dominantTag: dominantTag ?? '',
        percentOfIntake: cuisines[0]?.percentOfIntake ?? 0,
      });
      if (dominantInsight) {
        insights.push(dominantInsight);
      }
      const highlightedMeals = buildHighlightedMeals(
        cuisineItems,
        dominantTag,
        totalCalories,
      );

      return {
        success: true,
        message: 'Most consumed cuisines analytics retrieved successfully',
        data: {
          selectedRange: range,
          cuisines,
          targetLineCalories,
          insights,
          highlightedMeals,
        },
      };
    } catch (error) {
      throw this.wrapError(error, 'Failed to get cuisine analytics');
    }
  }

  private async loadContext(userId: string, from: Date, to: Date) {
    const [mealRows, scans] = await Promise.all([
      this.meals.getMealsInRange(userId, from, to),
      this.ingestion.getCompletedScans(userId, from, to),
    ]);

    const meals: MealMetricRow[] = mealRows.map((meal) => ({
      mealDate: meal.mealDate,
      mealSlot: meal.mealSlot,
      calories: meal.calories,
      proteinG: meal.proteinG,
      carbG: meal.carbG,
      fatG: meal.fatG,
      naiScore: meal.naiScore,
      loggedAt: meal.loggedAt,
      dishId: meal.dishId,
    }));

    const dishIds = [...new Set(meals.map((meal) => meal.dishId))];
    const dishes = await this.ingestion.getDishesBatch(userId, dishIds);
    const dishNamesById = new Map(dishes.map((dish) => [dish.id, dish.name]));

    return { meals, scans, dishNamesById };
  }

  private buildCaloriesScoreChartBars(
    meals: MealMetricRow[],
    dailyMap: Map<string, DailyMetrics>,
    days: Date[],
    calorieTarget: number | null,
  ) {
    const todayKey = formatIsoDate(utcDayStart(new Date()));
    const bars: Array<{
      label: string;
      date: string;
      mealSlot: MealSlot | null;
      colorKey: string;
      naiScore: number | null;
      calories: number;
      slotCalorieTarget: number | null;
      deltaFromSlotTarget: number | null;
      isToday: boolean;
      status: 'under' | 'over' | 'on_track' | 'no_data';
    }> = [];

    for (const day of days) {
      const dateKey = formatIsoDate(day);
      const label = day.getUTCDate().toString().padStart(2, '0');
      const dayMeals = meals.filter(
        (meal) => formatIsoDate(meal.mealDate) === dateKey,
      );

      if (dayMeals.length > 0) {
        for (const slot of Object.values(MealSlot)) {
          const slotMeals = dayMeals.filter((meal) => meal.mealSlot === slot);
          if (slotMeals.length === 0) {
            continue;
          }
          const calories = slotMeals.reduce(
            (sum, meal) => sum + meal.calories,
            0,
          );
          const slotCalorieTarget =
            calorieTarget === null
              ? null
              : Math.round(calorieTarget * MEAL_SLOT_RATIOS[slot]);
          const deltaFromSlotTarget =
            slotCalorieTarget === null ? null : calories - slotCalorieTarget;
          bars.push({
            label,
            date: dateKey,
            mealSlot: slot,
            colorKey: slot.toLowerCase(),
            naiScore: computeDailyNaiFromMeals(slotMeals),
            calories,
            slotCalorieTarget,
            deltaFromSlotTarget,
            isToday: dateKey === todayKey,
            status: this.calorieBarStatus(calories, slotCalorieTarget),
          });
        }
        continue;
      }

      const metrics = getDailyMetrics(dailyMap, day);
      if (metrics.dataSource === 'none' || metrics.naiScore === null) {
        continue;
      }
      bars.push({
        label,
        date: dateKey,
        mealSlot: null,
        colorKey: 'default',
        naiScore: metrics.naiScore,
        calories: metrics.calories,
        slotCalorieTarget: calorieTarget,
        deltaFromSlotTarget:
          calorieTarget === null ? null : metrics.calories - calorieTarget,
        isToday: dateKey === todayKey,
        status: this.calorieBarStatus(metrics.calories, calorieTarget),
      });
    }

    return bars;
  }

  private calorieBarStatus(
    calories: number,
    target: number | null,
  ): 'under' | 'over' | 'on_track' | 'no_data' {
    if (calories <= 0) {
      return 'no_data';
    }
    if (target === null || target <= 0) {
      return 'on_track';
    }
    const delta = calories - target;
    if (Math.abs(delta) <= target * 0.1) {
      return 'on_track';
    }
    return delta > 0 ? 'over' : 'under';
  }

  private buildMealSuggestions(
    calorieTarget: number | null,
    todayMeals: MealMetricRow[],
  ) {
    if (calorieTarget === null || calorieTarget <= 0) {
      return Object.values(MealSlot).map((slot) => ({
        slot,
        suggestedCalories: 0,
      }));
    }

    const eatenBySlot = new Map<MealSlot, number>();
    for (const meal of todayMeals) {
      const slot = meal.mealSlot as MealSlot;
      eatenBySlot.set(slot, (eatenBySlot.get(slot) ?? 0) + meal.calories);
    }

    return Object.values(MealSlot).map((slot) => {
      const target = Math.round(calorieTarget * MEAL_SLOT_RATIOS[slot]);
      const eaten = eatenBySlot.get(slot) ?? 0;
      return {
        slot,
        suggestedCalories: Math.max(0, target - eaten),
      };
    });
  }

  private buildTodayMacroChartPoints(
    meals: MealMetricRow[],
    scans: AnalyticsScan[],
  ) {
    const todayStart = utcDayStart(new Date());
    const todayMeals = meals.filter(
      (meal) => utcDayStart(meal.mealDate).getTime() === todayStart.getTime(),
    );
    const todayScans = scans.filter(
      (scan) => utcDayStart(scan.scanTime).getTime() === todayStart.getTime(),
    );
    const preferMeals = todayMeals.length > 0;

    return todayMacroTimeBuckets().map((bucket) => {
      let proteinG = 0;
      let carbG = 0;
      let fatG = 0;

      if (preferMeals) {
        for (const meal of todayMeals) {
          if (meal.loggedAt <= bucket.end) {
            proteinG += meal.proteinG ?? 0;
            carbG += meal.carbG ?? 0;
            fatG += meal.fatG ?? 0;
          }
        }
      } else {
        for (const scan of todayScans) {
          if (scan.scanTime <= bucket.end) {
            for (const dish of scan.dishes) {
              proteinG += dish.proteinG;
              carbG += dish.carbG;
              fatG += dish.fatG;
            }
          }
        }
      }

      const percents = macroPercents(proteinG, carbG, fatG);
      if (percents.totalCalories === 0) {
        return {
          label: bucket.label,
          date: bucket.date,
          deviationPercent: 0,
          status: 'within_goal' as const,
        };
      }

      const deviationPercent = macroDeviationPercent(percents);
      return {
        label: bucket.label,
        date: bucket.date,
        deviationPercent,
        status: this.macroDeviationStatus(deviationPercent),
      };
    });
  }

  private buildRangeMacroChartPoints(
    dailyMap: Map<string, DailyMetrics>,
    range: 'today' | 'week' | 'month',
  ) {
    const buckets = buildRangeBuckets(range);
    return buckets.map((bucket) => {
      const metricsInBucket: DailyMetrics[] = [];
      for (
        let cursor = new Date(bucket.start);
        cursor < bucket.end;
        cursor.setUTCDate(cursor.getUTCDate() + 1)
      ) {
        const metrics = getDailyMetrics(dailyMap, cursor);
        if (metrics.dataSource !== 'none') {
          metricsInBucket.push(metrics);
        }
      }
      if (metricsInBucket.length === 0) {
        return {
          label: bucket.label,
          date: bucket.date,
          deviationPercent: 0,
          status: 'within_goal' as const,
        };
      }
      const deviationPercent = Math.round(
        metricsInBucket.reduce((sum, metrics) => {
          const percents = macroPercents(
            metrics.proteinG,
            metrics.carbG,
            metrics.fatG,
          );
          return sum + macroDeviationPercent(percents);
        }, 0) / metricsInBucket.length,
      );
      return {
        label: bucket.label,
        date: bucket.date,
        deviationPercent,
        status: this.macroDeviationStatus(deviationPercent),
      };
    });
  }

  private macroDeviationStatus(
    deviationPercent: number,
  ): 'within_goal' | 'slightly_off' | 'out_of_range' {
    if (deviationPercent > 15) {
      return 'out_of_range';
    }
    if (deviationPercent > 5) {
      return 'slightly_off';
    }
    return 'within_goal';
  }

  private macroCard(
    percent: number,
    goalPercent: number,
    macro: 'carbs' | 'fat' | 'protein',
  ) {
    const status = macroStatus(percent, goalPercent);
    const labels: Record<typeof macro, Record<typeof status, string>> = {
      carbs: {
        within_goal: `${percent}% - Perfect balance today!`,
        slightly_off: `${percent}% - Carbs slightly off target`,
        out_of_range: `${percent}% - Carbs need attention`,
      },
      fat: {
        within_goal: `${percent}% - Fat on target`,
        slightly_off: `${percent}% - Fat deviated from range`,
        out_of_range: `${percent}% - Fat needs attention`,
      },
      protein: {
        within_goal: `${percent}% - Protein on target`,
        slightly_off: `${percent}% - Protein slightly low`,
        out_of_range: `${percent}% - Protein needs attention`,
      },
    };
    return {
      percent,
      status,
      label: labels[macro][status],
    };
  }

  private mealInWeekLabels(
    mealDate: Date,
    weeks: ReturnType<typeof lastNWeeks>,
    labels: Set<string>,
  ) {
    const date = utcDayStart(mealDate);
    return weeks.some(
      (week) =>
        labels.has(week.label) && date >= week.weekStart && date < week.weekEnd,
    );
  }

  private wrapError(error: unknown, message: string) {
    if (error instanceof HttpException) {
      return error;
    }
    return new InternalServerErrorException(message);
  }
}
