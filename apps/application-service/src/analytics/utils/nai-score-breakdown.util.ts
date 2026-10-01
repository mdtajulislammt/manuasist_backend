import {
  DEFAULT_MACRO_GOAL,
  macroDeviationPercent,
  macroPercents,
  type DailyMetrics,
  type MealMetricRow,
  type AnalyticsScan,
} from './daily-metrics.util';
import type { IngestionBatchDish } from '../ai-ingestion-analytics-client.service';

export type NaiFactorCode = 'DC' | 'CB' | 'MB' | 'AS' | 'MT' | 'FQ' | 'ME';

export type NaiFactorStatus =
  | 'Excellent'
  | 'Good'
  | 'Needs Work'
  | 'Fair'
  | 'No data';

export type NaiFactorScore = {
  code: NaiFactorCode;
  title: string;
  score: number | null;
  status: NaiFactorStatus;
  colorKey: 'green' | 'yellow' | 'red' | 'grey';
};

const FACTOR_META: Record<
  NaiFactorCode,
  { title: string; code: NaiFactorCode }
> = {
  DC: { code: 'DC', title: 'Diet Compliance (DC)' },
  CB: { code: 'CB', title: 'Calorie Balance (CB)' },
  MB: { code: 'MB', title: 'Macro Balance (MB)' },
  AS: { code: 'AS', title: 'Allergen Safety (AS)' },
  MT: { code: 'MT', title: 'Meal Timing (MT)' },
  FQ: { code: 'FQ', title: 'Food Quality (FQ)' },
  ME: { code: 'ME', title: 'Mood & Energy (ME)' },
};

export function healthierThanPercent(score: number): number {
  return Math.min(99, Math.max(1, Math.round(50 + score * 0.25)));
}

export function scoreRating(score: number | null): string | null {
  if (score === null) {
    return null;
  }
  if (score >= 90) {
    return 'Excellent';
  }
  if (score >= 75) {
    return 'Good';
  }
  if (score >= 60) {
    return 'Fair';
  }
  return 'Needs attention';
}

function factorStatus(score: number | null): NaiFactorStatus {
  if (score === null) {
    return 'No data';
  }
  if (score >= 85) {
    return 'Excellent';
  }
  if (score >= 70) {
    return 'Good';
  }
  if (score >= 50) {
    return 'Fair';
  }
  return 'Needs Work';
}

function factorColorKey(score: number | null): NaiFactorScore['colorKey'] {
  if (score === null) {
    return 'grey';
  }
  if (score >= 85) {
    return 'green';
  }
  if (score >= 70) {
    return 'yellow';
  }
  return 'red';
}

function buildFactor(code: NaiFactorCode, score: number | null): NaiFactorScore {
  return {
    code,
    title: FACTOR_META[code].title,
    score,
    status: factorStatus(score),
    colorKey: factorColorKey(score),
  };
}

function scoreDietCompliance(meals: MealMetricRow[]): number | null {
  if (meals.length === 0) {
    return null;
  }
  const avg =
    meals.reduce((sum, meal) => sum + meal.naiScore, 0) / meals.length;
  return Math.round(avg);
}

function scoreCalorieBalance(
  dailyMap: Map<string, DailyMetrics>,
  calorieTarget: number | null,
): number | null {
  if (calorieTarget === null || calorieTarget <= 0) {
    return null;
  }
  const loggedDays = [...dailyMap.values()].filter(
    (row) => row.dataSource !== 'none',
  );
  if (loggedDays.length === 0) {
    return null;
  }
  const onTrackDays = loggedDays.filter((row) => {
    const ratio = row.calories / calorieTarget;
    return ratio >= 0.85 && ratio <= 1.15;
  }).length;
  return Math.round((onTrackDays / loggedDays.length) * 100);
}

function scoreMacroBalance(dailyMap: Map<string, DailyMetrics>): number | null {
  const loggedDays = [...dailyMap.values()].filter(
    (row) => row.dataSource !== 'none',
  );
  if (loggedDays.length === 0) {
    return null;
  }
  const avgDeviation =
    loggedDays.reduce((sum, row) => {
      return (
        sum +
        macroDeviationPercent(
          macroPercents(row.proteinG, row.carbG, row.fatG),
          DEFAULT_MACRO_GOAL,
        )
      );
    }, 0) / loggedDays.length;
  return Math.max(0, Math.min(100, Math.round(100 - avgDeviation * 3)));
}

function scoreAllergenSafety(
  meals: MealMetricRow[],
  hasAllergies: boolean,
): number | null {
  if (!hasAllergies) {
    return meals.length > 0 ? 100 : null;
  }
  if (meals.length === 0) {
    return null;
  }
  const safeMeals = meals.filter((meal) => meal.naiScore >= 70).length;
  return Math.round((safeMeals / meals.length) * 100);
}

function scoreMealTiming(meals: MealMetricRow[]): number | null {
  if (meals.length === 0) {
    return null;
  }
  let score = 100;
  const lateNightCount = meals.filter(
    (meal) => meal.loggedAt.getUTCHours() >= 21,
  ).length;
  score -= lateNightCount * 12;

  const days = new Set(meals.map((meal) => meal.mealDate.toISOString()));
  for (const dayKey of days) {
    const dayMeals = meals.filter(
      (meal) => meal.mealDate.toISOString() === dayKey,
    );
    const slots = new Set(dayMeals.map((meal) => meal.mealSlot));
    if (slots.size === 1 && dayMeals.length === 1) {
      score -= 5;
    }
  }

  return Math.max(0, Math.min(100, Math.round(score)));
}

function categoryQualityPoints(category: string): number {
  if (category === 'RECOMMENDED') {
    return 100;
  }
  if (category === 'CAUTION') {
    return 60;
  }
  if (category === 'AVOID') {
    return 20;
  }
  return 50;
}

function scoreFoodQuality(
  meals: MealMetricRow[],
  scans: AnalyticsScan[],
  dishesById: Map<string, IngestionBatchDish>,
): number | null {
  let weightedSum = 0;
  let totalWeight = 0;

  for (const meal of meals) {
    const dish = dishesById.get(meal.dishId);
    const points = categoryQualityPoints(dish?.category ?? 'CAUTION');
    weightedSum += points * meal.calories;
    totalWeight += meal.calories;
  }

  for (const scan of scans) {
    for (const dish of scan.dishes) {
      const points = categoryQualityPoints(dish.category);
      weightedSum += points * dish.calories;
      totalWeight += dish.calories;
    }
  }

  if (totalWeight <= 0) {
    return null;
  }
  return Math.round(weightedSum / totalWeight);
}

function scoreMoodEnergy(cb: number | null, mt: number | null): number | null {
  if (cb === null && mt === null) {
    return null;
  }
  const values = [cb, mt].filter((value): value is number => value !== null);
  return Math.round(values.reduce((sum, value) => sum + value, 0) / values.length);
}

export function buildNaiScoreBreakdown(input: {
  meals: MealMetricRow[];
  scans: AnalyticsScan[];
  dishes: IngestionBatchDish[];
  dailyMap: Map<string, DailyMetrics>;
  calorieTarget: number | null;
  hasAllergies: boolean;
}): NaiFactorScore[] {
  const dishesById = new Map(input.dishes.map((dish) => [dish.id, dish]));
  const dc = scoreDietCompliance(input.meals);
  const cb = scoreCalorieBalance(input.dailyMap, input.calorieTarget);
  const mb = scoreMacroBalance(input.dailyMap);
  const as = scoreAllergenSafety(input.meals, input.hasAllergies);
  const mt = scoreMealTiming(input.meals);
  const fq = scoreFoodQuality(input.meals, input.scans, dishesById);
  const me = scoreMoodEnergy(cb, mt);

  return [
    buildFactor('DC', dc),
    buildFactor('CB', cb),
    buildFactor('MB', mb),
    buildFactor('AS', as),
    buildFactor('MT', mt),
    buildFactor('FQ', fq),
    buildFactor('ME', me),
  ];
}
