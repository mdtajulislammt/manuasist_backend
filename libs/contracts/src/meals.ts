export enum MealSlot {
  BREAKFAST = 'BREAKFAST',
  LUNCH = 'LUNCH',
  DINNER = 'DINNER',
  SNACKS = 'SNACKS',
}

export type PortionOption = {
  factor: number;
  label: string;
};

export const MEAL_PORTION_OPTIONS: PortionOption[] = [
  { factor: 0.5, label: 'Small (1/2)' },
  { factor: 1.0, label: 'Medium (1x)' },
  { factor: 1.5, label: 'Large (1.5x)' },
];

export const MEAL_PORTION_FACTORS = MEAL_PORTION_OPTIONS.map(
  (option) => option.factor,
);

export type MealSlotOption = {
  slot: MealSlot;
  label: string;
};

export const MEAL_SLOT_OPTIONS: MealSlotOption[] = [
  { slot: MealSlot.BREAKFAST, label: 'Breakfast' },
  { slot: MealSlot.LUNCH, label: 'Lunch' },
  { slot: MealSlot.DINNER, label: 'Dinner' },
  { slot: MealSlot.SNACKS, label: 'Snacks' },
];

export type MealNutrition = {
  calories: number;
  proteinG: number | null;
  carbG: number | null;
  fatG: number | null;
};

export type MealNaiImpact = {
  deltaPoints: number;
  projectedDailyNai: number | null;
  currentDailyNai: number | null;
  label: string;
};

export type MealPrefillDish = {
  dishId: string;
  scanId: string;
  name: string;
  imageUrl: string | null;
  tags: string[];
  description: string;
  category: string;
  baseNaiScore: number;
  scoreLabel: string;
  caloriesLabel: string;
  isBookmarked: boolean;
};

export type MealTodayContext = {
  loggedMealCount: number;
  currentDailyCalories: number;
  currentDailyNai: number | null;
};

export type MealDefaultNaiPreview = {
  naiScore: number;
  naiImpact: MealNaiImpact;
};

export type MealPrefillResponse = {
  dish: MealPrefillDish;
  baseNutrition: MealNutrition;
  portionOptions: PortionOption[];
  mealSlotOptions: MealSlotOption[];
  defaultMealSlot: MealSlot;
  defaultPortionFactor: number;
  defaultNutrition: MealNutrition;
  defaultLoggedAt: string;
  defaultNaiPreview: MealDefaultNaiPreview;
  portionCaloriesHint: string;
  todayContext: MealTodayContext;
};

export type MealPreviewRequest = {
  dishId: string;
  portionFactor: number;
  mealSlot: MealSlot;
  nutrition?: Partial<MealNutrition>;
};

export type MealPreviewResponse = {
  nutrition: MealNutrition;
  naiScore: number;
  naiImpact: MealNaiImpact;
};

export type MealLogRequest = MealPreviewRequest & {
  loggedAt?: string;
};

export type MealLogEntrySummary = {
  id: string;
  dishId: string;
  scanId: string | null;
  mealSlot: MealSlot;
  portionFactor: number;
  nutrition: MealNutrition;
  naiScore: number;
  isAdjusted: boolean;
  loggedAt: string;
};

export type MealLogResponse = {
  entry: MealLogEntrySummary;
  dailyTotals: {
    calories: number;
    dailyNai: number | null;
    mealCount: number;
  };
};

export type MealTodayGroupedResponse = {
  date: string;
  totals: {
    calories: number;
    dailyNai: number | null;
    mealCount: number;
  };
  bySlot: Record<
    MealSlot,
    {
      slot: MealSlot;
      items: MealLogEntrySummary[];
    }
  >;
};
