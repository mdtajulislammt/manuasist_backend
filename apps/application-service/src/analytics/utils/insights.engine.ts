import { detectCuisineTags } from '../../../../../libs/ai-pipeline/src/patterns/cuisine-tags';
import type { MacroRangeSummary, MealMetricRow } from './daily-metrics.util';

export type InsightSeverity = 'info' | 'warning' | 'positive';

export type AnalyticsInsight = {
  kind: string;
  severity: InsightSeverity;
  text: string;
  tip?: string;
};

const CUISINE_DISPLAY: Record<string, string> = {
  italian: 'Italian',
  mexican: 'Mexican',
  japanese: 'Japanese',
  indian: 'Indian',
  thai: 'Thai',
  american: 'American',
  mediterranean: 'Mediterranean',
};

export function cuisineDisplayName(tag: string): string {
  return CUISINE_DISPLAY[tag] ?? tag.charAt(0).toUpperCase() + tag.slice(1);
}

function isWeekend(date: Date): boolean {
  const day = date.getUTCDay();
  return day === 0 || day === 6;
}

export function buildCalorieInsights(input: {
  meals: MealMetricRow[];
  calorieTarget: number | null;
}): AnalyticsInsight[] {
  const insights: AnalyticsInsight[] = [];
  const { meals, calorieTarget } = input;

  const weekendMeals = meals.filter((meal) => isWeekend(meal.loggedAt));
  const weekdayMeals = meals.filter((meal) => !isWeekend(meal.loggedAt));
  const weekendAvg =
    weekendMeals.length > 0
      ? weekendMeals.reduce((sum, meal) => sum + meal.calories, 0) /
        new Set(weekendMeals.map((meal) => meal.mealDate.toISOString())).size
      : 0;
  const weekdayAvg =
    weekdayMeals.length > 0
      ? weekdayMeals.reduce((sum, meal) => sum + meal.calories, 0) /
        new Set(weekdayMeals.map((meal) => meal.mealDate.toISOString())).size
      : 0;

  if (weekendAvg > weekdayAvg * 1.15 && weekendMeals.length > 0) {
    insights.push({
      kind: 'weekend_calories',
      severity: 'warning',
      text: 'High calorie intake on weekends',
    });
  }

  const lateNightMeals = meals.filter((meal) => meal.loggedAt.getUTCHours() >= 21);
  if (lateNightMeals.length >= 2) {
    insights.push({
      kind: 'late_night_snacks',
      severity: 'warning',
      text: 'Frequent late-night snacks increasing total intake',
    });
  }

  const slotTotals = new Map<string, number>();
  for (const meal of meals) {
    slotTotals.set(
      meal.mealSlot,
      (slotTotals.get(meal.mealSlot) ?? 0) + meal.calories,
    );
  }
  const largestSlot = [...slotTotals.entries()].sort((a, b) => b[1] - a[1])[0];
  if (largestSlot && largestSlot[1] > 0) {
    const avgPerMeal = Math.round(
      largestSlot[1] /
        meals.filter((meal) => meal.mealSlot === largestSlot[0]).length,
    );
    insights.push({
      kind: 'largest_meal_slot',
      severity: 'info',
      text: `${titleCase(largestSlot[0])} is your largest meal (~${avgPerMeal} kcal)`,
    });
  }

  if (calorieTarget && calorieTarget > 0) {
    const dinnerCalories = meals
      .filter((meal) => meal.mealSlot === 'DINNER')
      .reduce((sum, meal) => sum + meal.calories, 0);
    const dinnerDays = new Set(
      meals
        .filter((meal) => meal.mealSlot === 'DINNER')
        .map((meal) => meal.mealDate.toISOString()),
    ).size;
    if (dinnerDays > 0) {
      const avgDinner = Math.round(dinnerCalories / dinnerDays);
      const delta = avgDinner - calorieTarget;
      if (delta > 200) {
        insights.push({
          kind: 'dinner_over_target',
          severity: 'warning',
          text: `Dinner calories exceed your daily target by +${delta} kcal`,
        });
      }
    }
  }

  return insights;
}

export function buildOffWeekInsights(input: {
  offWeekMeals: MealMetricRow[];
  offWeekCount: number;
  dishNamesById: Map<string, string>;
}): AnalyticsInsight[] {
  const { offWeekMeals, offWeekCount, dishNamesById } = input;
  if (offWeekCount === 0 || offWeekMeals.length === 0) {
    return [];
  }

  const lateNightItalianWeeks = new Set<string>();
  for (const meal of offWeekMeals) {
    if (meal.loggedAt.getUTCHours() < 21) {
      continue;
    }
    const dishName = dishNamesById.get(meal.dishId) ?? '';
    const tags = detectCuisineTags([dishName]);
    if (tags.includes('italian')) {
      lateNightItalianWeeks.add(meal.mealDate.toISOString().slice(0, 10));
    }
  }

  const percent = Math.round((lateNightItalianWeeks.size / offWeekCount) * 100);
  if (percent >= 50) {
    return [
      {
        kind: 'off_week_late_italian',
        severity: 'warning',
        text: `${percent}% of your off weeks come from late-night Italian dinners`,
      },
    ];
  }

  return [];
}

export type MacroDistributionSnapshot = {
  percent: number;
  status: 'within_goal' | 'slightly_off' | 'out_of_range';
};

export type MacroChartPointSnapshot = {
  deviationPercent: number | null;
  status: 'within_goal' | 'slightly_off' | 'out_of_range';
};

export function buildMacroInsights(input: {
  scanDayCount: number;
  highFatScanDays: number;
  period?: 'today' | 'range';
  hasLoggedData?: boolean;
  todayDistribution?: {
    carbs: MacroDistributionSnapshot;
    fat: MacroDistributionSnapshot;
    protein: MacroDistributionSnapshot;
  };
  chartPoints?: MacroChartPointSnapshot[];
  rangeSummary?: MacroRangeSummary;
}): AnalyticsInsight[] {
  const {
    scanDayCount,
    highFatScanDays,
    period = 'range',
    hasLoggedData = false,
    todayDistribution,
    chartPoints = [],
    rangeSummary,
  } = input;

  if (scanDayCount > 0 && highFatScanDays / scanDayCount >= 0.4) {
    return [
      {
        kind: 'restaurant_fat',
        severity: 'warning',
        text:
          period === 'today'
            ? 'Restaurant meals today push your fat intake above healthy levels'
            : 'Restaurant days push your fat intake above healthy levels',
      },
      {
        kind: 'restaurant_fat_tip',
        severity: 'info',
        text: 'Tip: Choose grilled instead of fried to stay within your daily NAI goal.',
      },
    ];
  }

  if (!hasLoggedData) {
    return [
      {
        kind: 'no_macro_data',
        severity: 'info',
        text:
          period === 'today'
            ? 'Log meals or scan a menu to unlock macro insights for today.'
            : 'Log meals throughout this period to see personalized macro insights.',
      },
    ];
  }

  const insights: AnalyticsInsight[] = [];

  if (period === 'range' && rangeSummary && rangeSummary.loggedDayCount > 0) {
    const { loggedDayCount, outOfRangeDayCount, slightlyOffDayCount } =
      rangeSummary;
    const offRatio = outOfRangeDayCount / loggedDayCount;
    const slightRatio = slightlyOffDayCount / loggedDayCount;

    if (offRatio >= 0.4) {
      insights.push({
        kind: 'range_macro_drift',
        severity: 'warning',
        text: `Macros were outside your goal range on ${outOfRangeDayCount} of ${loggedDayCount} logged days`,
      });
    } else if (slightRatio >= 0.5) {
      insights.push({
        kind: 'range_macro_slight_drift',
        severity: 'warning',
        text: `Macro balance slipped slightly on several days this ${rangeSummary.loggedDayCount >= 20 ? 'month' : 'week'}`,
      });
    } else if (rangeSummary.avgDeviationPercent <= 5) {
      insights.push({
        kind: 'range_macro_balance',
        severity: 'positive',
        text: 'You stayed close to your macro goals across most logged days',
      });
    }
  }

  if (period === 'today' && todayDistribution) {
    const macroOrder = [
      { key: 'fat' as const, snapshot: todayDistribution.fat },
      { key: 'carbs' as const, snapshot: todayDistribution.carbs },
      { key: 'protein' as const, snapshot: todayDistribution.protein },
    ];
    const worst = macroOrder
      .filter((row) => row.snapshot.status !== 'within_goal')
      .sort((a, b) => statusRank(b.snapshot.status) - statusRank(a.snapshot.status))[0];

    if (worst && insights.length === 0) {
      insights.push({
        kind: `${worst.key}_${worst.snapshot.status}`,
        severity:
          worst.snapshot.status === 'out_of_range' ? 'warning' : 'info',
        text: macroDistributionText(worst.key, worst.snapshot, 'today'),
      });
    }

    const worsening = isChartWorsening(chartPoints);
    if (worsening && insights.length === 0) {
      insights.push({
        kind: 'intraday_macro_drift',
        severity: 'warning',
        text: 'Your macro balance drifted further from goal as the day went on',
      });
    }
  }

  if (insights.length === 0 && todayDistribution) {
    const allWithin = ['carbs', 'fat', 'protein'].every(
      (key) =>
        todayDistribution[key as keyof typeof todayDistribution].status ===
        'within_goal',
    );
    if (allWithin) {
      insights.push({
        kind: 'macro_balance',
        severity: 'positive',
        text:
          period === 'today'
            ? 'Your macros are well balanced today — keep it up!'
            : 'Your macros look balanced based on your latest logged day',
      });
    }
  }

  const primary = insights[0];
  if (primary && shouldAttachMacroTip(primary.kind)) {
    const tip = macroTipForKind(primary.kind);
    if (tip) {
      return [primary, { kind: `${primary.kind}_tip`, severity: 'info', text: tip }];
    }
  }

  return insights.slice(0, 2);
}

function statusRank(status: MacroDistributionSnapshot['status']): number {
  if (status === 'out_of_range') {
    return 2;
  }
  if (status === 'slightly_off') {
    return 1;
  }
  return 0;
}

function macroDistributionText(
  macro: 'carbs' | 'fat' | 'protein',
  snapshot: MacroDistributionSnapshot,
  period: 'today' | 'range',
): string {
  const label = macro === 'carbs' ? 'Carbs' : macro === 'fat' ? 'Fat' : 'Protein';
  const when = period === 'today' ? 'today' : 'on your latest logged day';
  if (snapshot.status === 'out_of_range') {
    return `${label} make up ${snapshot.percent}% of your calories ${when} — outside your healthy range`;
  }
  return `${label} is slightly off your target at ${snapshot.percent}% ${when}`;
}

function isChartWorsening(chartPoints: MacroChartPointSnapshot[]): boolean {
  const values = chartPoints
    .map((point) => point.deviationPercent)
    .filter((value): value is number => value !== null);
  if (values.length < 2) {
    return false;
  }
  const first = values[0];
  const last = values[values.length - 1];
  const lastStatus = chartPoints[chartPoints.length - 1]?.status;
  return (
    last > first + 5 &&
    (lastStatus === 'slightly_off' || lastStatus === 'out_of_range')
  );
}

function shouldAttachMacroTip(kind: string): boolean {
  return (
    kind.includes('fat') ||
    kind.includes('carbs') ||
    kind.includes('protein') ||
    kind === 'intraday_macro_drift' ||
    kind === 'range_macro_drift'
  );
}

function macroTipForKind(kind: string): string | null {
  if (kind.includes('fat') || kind === 'restaurant_fat') {
    return 'Tip: Choose grilled instead of fried to stay within your daily NAI goal.';
  }
  if (kind.includes('carbs')) {
    return 'Tip: Swap refined carbs for vegetables or whole grains at your next meal.';
  }
  if (kind.includes('protein')) {
    return 'Tip: Add a lean protein source like fish, chicken, or legumes to your next meal.';
  }
  if (kind === 'intraday_macro_drift' || kind === 'range_macro_drift') {
    return 'Tip: Plan your next meal around the macro you are furthest from goal on.';
  }
  return null;
}

export function buildRestaurantInsights(input: {
  heavyCategoryCount: number;
  healthyCategoryCount: number;
}): AnalyticsInsight[] {
  const { heavyCategoryCount, healthyCategoryCount } = input;
  if (heavyCategoryCount >= healthyCategoryCount * 3 && heavyCategoryCount > 0) {
    return [
      {
        kind: 'steakhouse_pattern',
        severity: 'warning',
        text: 'Steakhouses appear 3x more often than healthy options',
        tip: 'Tip: Choose grilled items or limit visits to twice a week to improve NAI.',
      },
    ];
  }
  return [];
}

export function buildCuisineInsight(input: {
  dominantTag: string;
  percentOfIntake: number;
}): AnalyticsInsight | null {
  if (input.percentOfIntake < 25) {
    return null;
  }
  return {
    kind: 'dominant_cuisine',
    severity: 'info',
    text: `${cuisineDisplayName(input.dominantTag)} cuisine contributes ${input.percentOfIntake}% of your weekly calories`,
    tip: 'Tip: Choose grilled items or limit visits to twice a week to improve NAI.',
  };
}

function titleCase(value: string): string {
  return value.charAt(0) + value.slice(1).toLowerCase();
}
