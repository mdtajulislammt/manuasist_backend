import { detectCuisineTags } from '../../../../../libs/ai-pipeline/src/patterns/cuisine-tags';
import { cuisineDisplayName } from './insights.engine';

export type CuisineCalorieRow = {
  tag: string;
  displayName: string;
  calories: number;
  percentOfIntake: number;
  status: 'below_target' | 'moderate' | 'excess';
};

export type HighlightedMealRow = {
  name: string;
  calories: number;
  cuisineTag: string;
  impactLabel: string;
};

export type CuisineFoodItem = {
  name: string;
  calories: number;
  dishId?: string;
};

function attributeCaloriesToTags(
  item: CuisineFoodItem,
  accumulator: Map<string, number>,
) {
  const tags = detectCuisineTags([item.name]);
  if (tags.length === 0) {
    const other = accumulator.get('other') ?? 0;
    accumulator.set('other', other + item.calories);
    return;
  }
  const share = item.calories / tags.length;
  for (const tag of tags) {
    accumulator.set(tag, (accumulator.get(tag) ?? 0) + share);
  }
}

export function aggregateCuisineCalories(items: CuisineFoodItem[]) {
  const totals = new Map<string, number>();
  for (const item of items) {
    attributeCaloriesToTags(item, totals);
  }
  return totals;
}

export function buildCuisineRows(
  totals: Map<string, number>,
  totalCalories: number,
  targetLineCalories: number,
): CuisineCalorieRow[] {
  return [...totals.entries()]
    .map(([tag, calories]) => {
      const percentOfIntake =
        totalCalories > 0 ? Math.round((calories / totalCalories) * 100) : 0;
      let status: CuisineCalorieRow['status'] = 'below_target';
      if (calories > targetLineCalories * 1.2) {
        status = 'excess';
      } else if (calories > targetLineCalories * 0.8) {
        status = 'moderate';
      }
      return {
        tag,
        displayName: tag === 'other' ? 'Other' : cuisineDisplayName(tag),
        calories: Math.round(calories),
        percentOfIntake,
        status,
      };
    })
    .sort((a, b) => b.calories - a.calories);
}

export function buildHighlightedMeals(
  items: CuisineFoodItem[],
  dominantTag: string | null,
  totalCalories: number,
): HighlightedMealRow[] {
  if (!dominantTag || totalCalories <= 0) {
    return [];
  }

  return items
    .filter((item) => detectCuisineTags([item.name]).includes(dominantTag))
    .sort((a, b) => b.calories - a.calories)
    .slice(0, 3)
    .map((item) => ({
      name: item.name,
      calories: item.calories,
      cuisineTag: dominantTag,
      impactLabel: `High Impact - ${Math.round((item.calories / totalCalories) * 100)}% of weekly calories`,
    }));
}

export function perCuisineTargetLine(
  weeklyCalorieTarget: number | null,
  cuisineCount: number,
): number {
  if (!weeklyCalorieTarget || weeklyCalorieTarget <= 0 || cuisineCount <= 0) {
    return 600;
  }
  return Math.round(weeklyCalorieTarget / cuisineCount);
}
