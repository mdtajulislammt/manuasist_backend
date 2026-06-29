import { buildRangeBuckets, formatIsoDate, utcDayStart } from './analytics-date.util';

export type MealMetricRow = {
  mealDate: Date;
  mealSlot: string;
  calories: number;
  proteinG: number | null;
  carbG: number | null;
  fatG: number | null;
  naiScore: number;
  loggedAt: Date;
  dishId: string;
};

export type AnalyticsScanDish = {
  id: string;
  name: string;
  calories: number;
  proteinG: number;
  carbG: number;
  fatG: number;
  category: string;
};

export type AnalyticsScan = {
  id: string;
  scanTime: Date;
  naiScore: number | null;
  dishes: AnalyticsScanDish[];
};

export type DailyMetrics = {
  date: string;
  calories: number;
  naiScore: number | null;
  proteinG: number;
  carbG: number;
  fatG: number;
  dataSource: 'meals' | 'scan' | 'none';
};

export function computeDailyNaiFromMeals(
  meals: Array<{ calories: number; naiScore: number }>,
): number | null {
  if (meals.length === 0) {
    return null;
  }
  const totalCalories = meals.reduce((sum, meal) => sum + meal.calories, 0);
  if (totalCalories <= 0) {
    return null;
  }
  const weighted = meals.reduce(
    (sum, meal) => sum + meal.naiScore * meal.calories,
    0,
  );
  return Math.round(weighted / totalCalories);
}

function sumScanDishMacros(scans: AnalyticsScan[]) {
  return scans.reduce(
    (totals, scan) => {
      for (const dish of scan.dishes) {
        totals.proteinG += dish.proteinG;
        totals.carbG += dish.carbG;
        totals.fatG += dish.fatG;
      }
      return totals;
    },
    { proteinG: 0, carbG: 0, fatG: 0 },
  );
}

function mealDateKey(mealDate: Date): string {
  return formatIsoDate(utcDayStart(mealDate));
}

function scanDateKey(scanTime: Date): string {
  return formatIsoDate(utcDayStart(scanTime));
}

export function buildDailyMetricsMap(
  meals: MealMetricRow[],
  scans: AnalyticsScan[],
): Map<string, DailyMetrics> {
  const map = new Map<string, DailyMetrics>();
  const mealsByDate = new Map<string, MealMetricRow[]>();
  const scansByDate = new Map<string, AnalyticsScan[]>();

  for (const meal of meals) {
    const key = mealDateKey(meal.mealDate);
    const bucket = mealsByDate.get(key) ?? [];
    bucket.push(meal);
    mealsByDate.set(key, bucket);
  }

  for (const scan of scans) {
    const key = scanDateKey(scan.scanTime);
    const bucket = scansByDate.get(key) ?? [];
    bucket.push(scan);
    scansByDate.set(key, bucket);
  }

  const allDates = new Set([...mealsByDate.keys(), ...scansByDate.keys()]);
  for (const date of allDates) {
    const dayMeals = mealsByDate.get(date) ?? [];
    const dayScans = scansByDate.get(date) ?? [];

    if (dayMeals.length > 0) {
      map.set(date, {
        date,
        calories: dayMeals.reduce((sum, meal) => sum + meal.calories, 0),
        naiScore: computeDailyNaiFromMeals(dayMeals),
        proteinG: dayMeals.reduce((sum, meal) => sum + (meal.proteinG ?? 0), 0),
        carbG: dayMeals.reduce((sum, meal) => sum + (meal.carbG ?? 0), 0),
        fatG: dayMeals.reduce((sum, meal) => sum + (meal.fatG ?? 0), 0),
        dataSource: 'meals',
      });
      continue;
    }

    if (dayScans.length > 0) {
      const latestScan = [...dayScans].sort(
        (a, b) => b.scanTime.getTime() - a.scanTime.getTime(),
      )[0];
      const macros = sumScanDishMacros(dayScans);
      map.set(date, {
        date,
        calories: dayScans.reduce(
          (sum, scan) =>
            sum + scan.dishes.reduce((dishSum, dish) => dishSum + dish.calories, 0),
          0,
        ),
        naiScore: latestScan.naiScore,
        proteinG: macros.proteinG,
        carbG: macros.carbG,
        fatG: macros.fatG,
        dataSource: 'scan',
      });
    }
  }

  return map;
}

export function getDailyMetrics(
  map: Map<string, DailyMetrics>,
  date: Date,
): DailyMetrics {
  const key = formatIsoDate(utcDayStart(date));
  return (
    map.get(key) ?? {
      date: key,
      calories: 0,
      naiScore: null,
      proteinG: 0,
      carbG: 0,
      fatG: 0,
      dataSource: 'none',
    }
  );
}

export function macroPercents(proteinG: number, carbG: number, fatG: number) {
  const proteinCalories = proteinG * 4;
  const carbCalories = carbG * 4;
  const fatCalories = fatG * 9;
  const total = proteinCalories + carbCalories + fatCalories;
  if (total <= 0) {
    return { carbPercent: 0, fatPercent: 0, proteinPercent: 0, totalCalories: 0 };
  }
  return {
    carbPercent: Math.round((carbCalories / total) * 100),
    fatPercent: Math.round((fatCalories / total) * 100),
    proteinPercent: Math.round((proteinCalories / total) * 100),
    totalCalories: Math.round(total),
  };
}

export const DEFAULT_MACRO_GOAL = {
  carbPercent: 50,
  fatPercent: 30,
  proteinPercent: 20,
};

export function macroDeviationPercent(
  actual: { carbPercent: number; fatPercent: number; proteinPercent: number },
  goal = DEFAULT_MACRO_GOAL,
): number {
  return Math.round(
    (Math.abs(actual.carbPercent - goal.carbPercent) +
      Math.abs(actual.fatPercent - goal.fatPercent) +
      Math.abs(actual.proteinPercent - goal.proteinPercent)) /
      3,
  );
}

export function macroStatus(
  percent: number,
  goalPercent: number,
): 'within_goal' | 'slightly_off' | 'out_of_range' {
  const delta = Math.abs(percent - goalPercent);
  if (delta <= 5) {
    return 'within_goal';
  }
  if (delta <= 15) {
    return 'slightly_off';
  }
  return 'out_of_range';
}

export type MacroRangeSummary = {
  loggedDayCount: number;
  outOfRangeDayCount: number;
  slightlyOffDayCount: number;
  avgDeviationPercent: number;
};

export function summarizeMacroRange(
  dailyMap: Map<string, DailyMetrics>,
  range: 'week' | 'month',
): MacroRangeSummary {
  const buckets = buildRangeBuckets(range);
  let loggedDayCount = 0;
  let outOfRangeDayCount = 0;
  let slightlyOffDayCount = 0;
  let deviationSum = 0;

  for (const bucket of buckets) {
    for (
      let cursor = new Date(bucket.start);
      cursor < bucket.end;
      cursor.setUTCDate(cursor.getUTCDate() + 1)
    ) {
      const metrics = getDailyMetrics(dailyMap, cursor);
      if (metrics.dataSource === 'none') {
        continue;
      }
      loggedDayCount++;
      const deviation = macroDeviationPercent(
        macroPercents(metrics.proteinG, metrics.carbG, metrics.fatG),
      );
      deviationSum += deviation;
      if (deviation > 15) {
        outOfRangeDayCount++;
      } else if (deviation > 5) {
        slightlyOffDayCount++;
      }
    }
  }

  return {
    loggedDayCount,
    outOfRangeDayCount,
    slightlyOffDayCount,
    avgDeviationPercent:
      loggedDayCount > 0 ? Math.round(deviationSum / loggedDayCount) : 0,
  };
}
