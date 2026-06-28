import { detectCuisineTags } from '../../../../../libs/ai-pipeline/src/patterns/cuisine-tags';
import type { MealMetricRow } from './daily-metrics.util';

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

export function buildMacroInsights(input: {
  scanDayCount: number;
  highFatScanDays: number;
}): AnalyticsInsight[] {
  const { scanDayCount, highFatScanDays } = input;
  if (scanDayCount > 0 && highFatScanDays / scanDayCount >= 0.4) {
    return [
      {
        kind: 'restaurant_fat',
        severity: 'warning',
        text: 'Restaurant days push your fat intake above healthy levels',
        tip: 'Tip: Choose grilled instead of fried to stay within your daily NAI goal.',
      },
    ];
  }
  return [];
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
