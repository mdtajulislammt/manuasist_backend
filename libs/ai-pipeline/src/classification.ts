import { LlmClient } from './llm-client';
import { detectCuisineTags } from './patterns/cuisine-tags';
import {
  dishClassificationSchema,
  type DishClassification,
  type ExtractedDishLine,
} from './schemas';

export type UserPreferenceHints = {
  dietType?: string | null;
  calorieTarget?: number | null;
  spiceLevel?: string | null;
  weightGoal?: string | null;
  allergies?: string[];
  intolerances?: string[];
  cuisinePreferences?: string[];
  healthObjectives?: string[];
  nutritionTargets?: Record<string, string | number | boolean>;
};

export type DishNutritionHints = {
  calories: number;
  proteinG?: number;
  carbG?: number;
  fatG?: number;
  source: string;
  confidence: number;
};

const SYSTEM = `You classify a single menu item for a diner with known preferences.
Return JSON only:
{
  "category": "RECOMMENDED" | "CAUTION" | "AVOID",
  "dietScore": 0-100,
  "allergenFlags"?: { [allergen: string]: boolean },
  "reasons": [{ "code": "DIET_ALIGN"|"ALLERGEN"|"INTOLERANCE"|"CUISINE"|"HEALTH_GOAL"|"NUTRITION_TARGET"|"MACRO"|"SPICE"|"CALORIE"|"UNCERTAIN"|"GENERAL", "severity": "info"|"warning"|"critical", "message": "..." }],
  "summary"?: "one short sentence"
}
RECOMMENDED = likely fits their goals; CAUTION = uncertain or moderate concern; AVOID = likely conflicts (allergens, diet conflict).
Use the provided dish text and nutrition evidence. Do not invent ingredients or nutrient values.
Every critical/warning reason must name the exact profile rule and the dish ingredient or nutrition value that conflicts.
Only values explicitly provided in allergies or intolerances may trigger a profile-specific allergen/intolerance conflict.
Cuisine preferences (for example Italian, Japanese, or Mexican) are positive preferences, never allergens or restrictions.
Not matching a favorite cuisine is not a reason to avoid a dish.
If an important ingredient or nutrient is unknown, use CAUTION/UNCERTAIN rather than claiming a conflict.
Always include at least one specific, user-facing reason.`;

export function classifyDishHeuristic(
  dish: ExtractedDishLine,
  prefs: UserPreferenceHints,
  nutrition?: DishNutritionHints,
): DishClassification {
  const dishText = `${dish.name} ${dish.description ?? ''}`.toLowerCase();
  const flags: Record<string, boolean> = {};
  const reasons: DishClassification['reasons'] = [];

  for (const allergy of prefs.allergies ?? []) {
    if (!restrictionMatchesDish(allergy, dishText)) continue;
    flags[allergy] = true;
    reasons.push({
      code: 'ALLERGEN',
      severity: 'critical',
      message: `${dish.name} appears to contain your listed allergen: ${allergy}`,
    });
  }

  for (const intolerance of prefs.intolerances ?? []) {
    if (!restrictionMatchesDish(intolerance, dishText)) continue;
    flags[`intolerance:${intolerance}`] = true;
    reasons.push({
      code: 'INTOLERANCE',
      severity: 'critical',
      message: `${dish.name} appears to conflict with your ${intolerance} intolerance`,
    });
  }

  if (prefs.dietType) {
    const conflict = dietConflict(prefs.dietType, dishText, nutrition);
    if (conflict) {
      reasons.push({
        code: 'DIET_ALIGN',
        severity: 'critical',
        message: `${dish.name} has ${conflict}, which conflicts with your ${prefs.dietType} plan`,
      });
    } else {
      reasons.push({
        code: 'DIET_ALIGN',
        severity: 'info',
        message: `No obvious conflict with your ${prefs.dietType} plan was found in the menu description`,
      });
    }
  }

  const detectedCuisines = detectCuisineTags([dishText]);
  const preferredCuisine = (prefs.cuisinePreferences ?? []).find((preference) =>
    detectedCuisines.includes(normalizeLabel(preference)),
  );
  if (preferredCuisine) {
    reasons.push({
      code: 'CUISINE',
      severity: 'info',
      message: `${dish.name} matches your ${preferredCuisine} cuisine preference`,
    });
  }

  addNutritionTargetReasons(reasons, prefs.nutritionTargets, nutrition);
  addHealthGoalReason(reasons, prefs.healthObjectives, nutrition);

  if (reasons.length === 0) {
    reasons.push({
      code: 'UNCERTAIN',
      severity: 'info',
      message: 'Limited preference data — review ingredients when ordering',
    });
  }

  const hasCritical = reasons.some((reason) => reason.severity === 'critical');
  const hasWarning = reasons.some((reason) => reason.severity === 'warning');
  const hasPositiveEvidence = reasons.some(
    (reason) =>
      reason.severity === 'info' &&
      ['DIET_ALIGN', 'CUISINE', 'HEALTH_GOAL', 'NUTRITION_TARGET'].includes(
        reason.code,
      ),
  );

  return {
    category: hasCritical
      ? 'AVOID'
      : hasWarning || !hasPositiveEvidence
        ? 'CAUTION'
        : 'RECOMMENDED',
    dietScore: hasCritical ? 30 : hasWarning ? 60 : hasPositiveEvidence ? 82 : 55,
    allergenFlags: Object.keys(flags).length ? flags : undefined,
    reasons,
    summary: hasCritical
      ? `${dish.name} conflicts with a saved dietary restriction`
      : hasWarning
        ? `${dish.name} needs review against your nutrition targets`
        : `${dish.name} aligns with the available profile evidence`,
  };
}

export async function classifyDish(
  dish: ExtractedDishLine,
  prefs: UserPreferenceHints,
  nutrition: DishNutritionHints,
  llm: LlmClient,
): Promise<DishClassification> {
  if (!llm.isConfigured()) {
    return classifyDishHeuristic(dish, prefs, nutrition);
  }
  const prefText = JSON.stringify(prefs ?? {});
  const nutritionText = JSON.stringify(nutrition);
  const result = await llm.completeJson(
    [
      { role: 'system', content: SYSTEM },
      {
        role: 'user',
        content: `Saved profile: ${prefText}\nNutrition evidence: ${nutritionText}\n\nDish: ${dish.name}${dish.description ? `\nDescription: ${dish.description}` : ''}`,
      },
    ],
    dishClassificationSchema,
  );
  if (!result.reasons?.length) {
    return {
      ...result,
      reasons: [
        {
          code: 'GENERAL',
          severity: 'info',
          message: result.summary ?? 'Classified based on your dietary profile',
        },
      ],
    };
  }
  return result;
}

function restrictionMatchesDish(restriction: string, dishText: string): boolean {
  const normalized = normalizeLabel(restriction);
  const aliases: Record<string, string[]> = {
    'dairy milk': ['dairy', 'milk', 'cheese', 'cream', 'butter', 'yogurt'],
    dairy: ['dairy', 'milk', 'cheese', 'cream', 'butter', 'yogurt'],
    lactose: ['milk', 'cheese', 'cream', 'butter', 'yogurt'],
    'wheat gluten': ['wheat', 'gluten', 'bread', 'pasta', 'flour'],
    gluten: ['wheat', 'gluten', 'bread', 'pasta', 'flour'],
    eggs: ['egg'],
    'tree nuts': ['almond', 'cashew', 'walnut', 'pecan', 'pistachio', 'hazelnut'],
    peanuts: ['peanut'],
    fish: ['fish', 'salmon', 'tuna', 'cod', 'tilapia', 'anchovy'],
    soy: ['soy', 'tofu', 'tempeh', 'edamame'],
    shellfish: ['shrimp', 'prawn', 'crab', 'lobster', 'shellfish'],
  };
  const terms = aliases[normalized] ?? [normalized];
  return terms.some((term) => containsTerm(dishText, term));
}

function dietConflict(
  dietType: string,
  dishText: string,
  nutrition?: DishNutritionHints,
): string | null {
  const diet = normalizeLabel(dietType);
  const conflictPatterns: RegExp[] = [];

  if (diet.includes('vegan')) {
    conflictPatterns.push(
      /\b(chicken|beef|pork|fish|lamb|meat|cheese|cream|milk|butter|egg)\b/i,
    );
  } else if (diet.includes('vegetarian')) {
    conflictPatterns.push(
      /\b(chicken|beef|pork|fish|lamb|meat|seafood)\b/i,
    );
  } else if (diet.includes('pescatarian')) {
    conflictPatterns.push(/\b(chicken|beef|pork|lamb|meat)\b/i);
  }
  if (diet.includes('halal')) {
    conflictPatterns.push(/\b(pork|bacon|ham|alcohol|wine)\b/i);
  }
  if (diet.includes('kosher')) {
    conflictPatterns.push(
      /\b(pork|bacon|ham|shrimp|prawn|crab|lobster|shellfish)\b/i,
    );
  }
  if (diet.includes('gluten free')) {
    conflictPatterns.push(/\b(wheat|gluten|bread|pasta|flour)\b/i);
  }
  if (diet.includes('dairy free')) {
    conflictPatterns.push(/\b(dairy|milk|cheese|cream|butter|yogurt)\b/i);
  }
  if (
    (diet.includes('keto') || diet.includes('ketogenic')) &&
    nutrition?.carbG !== undefined &&
    nutrition.carbG > 30
  ) {
    return `${nutrition.carbG} g carbohydrates`;
  }

  for (const pattern of conflictPatterns) {
    const match = dishText.match(pattern)?.[0];
    if (match) return `"${match}"`;
  }
  return null;
}

function addNutritionTargetReasons(
  reasons: NonNullable<DishClassification['reasons']>,
  targets: UserPreferenceHints['nutritionTargets'],
  nutrition?: DishNutritionHints,
): void {
  if (!targets || !nutrition) return;

  for (const [rawKey, rawTarget] of Object.entries(targets)) {
    const key = normalizeLabel(rawKey);
    const target = normalizeLabel(String(rawTarget));
    const evidence = nutritionEvidence(key, nutrition);

    if (evidence === null) {
      reasons.push({
        code: 'UNCERTAIN',
        severity: 'info',
        message: `${rawKey} is one of your targets, but this menu item has no reliable ${rawKey} value`,
      });
      continue;
    }

    const conflict =
      (target === 'low' && evidence.isHigh) ||
      (target === 'high' && evidence.isLow);
    reasons.push({
      code: 'NUTRITION_TARGET',
      severity: conflict ? 'warning' : 'info',
      message: conflict
        ? `${evidence.label} conflicts with your ${target} ${rawKey} target`
        : `${evidence.label} is compatible with your ${target} ${rawKey} target`,
    });
  }
}

function addHealthGoalReason(
  reasons: NonNullable<DishClassification['reasons']>,
  objectives: string[] | undefined,
  nutrition?: DishNutritionHints,
): void {
  if (!objectives?.length || !nutrition) return;
  const goal = objectives[0];
  const normalized = normalizeLabel(goal);

  if (normalized.includes('weight loss') && nutrition.calories > 700) {
    reasons.push({
      code: 'HEALTH_GOAL',
      severity: 'warning',
      message: `${nutrition.calories} kcal is relatively high for your ${goal} objective`,
    });
    return;
  }
  if (
    (normalized.includes('gain muscle') ||
      normalized.includes('fitness performance')) &&
    nutrition.proteinG !== undefined
  ) {
    reasons.push({
      code: 'HEALTH_GOAL',
      severity: nutrition.proteinG < 15 ? 'warning' : 'info',
      message: `${nutrition.proteinG} g protein was evaluated for your ${goal} objective`,
    });
  }
}

function nutritionEvidence(
  key: string,
  nutrition: DishNutritionHints,
): { label: string; isHigh: boolean; isLow: boolean } | null {
  if (key.includes('protein') && nutrition.proteinG !== undefined) {
    return {
      label: `${nutrition.proteinG} g protein`,
      isHigh: nutrition.proteinG >= 25,
      isLow: nutrition.proteinG < 12,
    };
  }
  if (
    (key.includes('carbohydrate') || key.includes('carb')) &&
    nutrition.carbG !== undefined
  ) {
    return {
      label: `${nutrition.carbG} g carbohydrates`,
      isHigh: nutrition.carbG > 50,
      isLow: nutrition.carbG < 20,
    };
  }
  if (key.includes('fat') && nutrition.fatG !== undefined) {
    return {
      label: `${nutrition.fatG} g fat`,
      isHigh: nutrition.fatG > 25,
      isLow: nutrition.fatG < 10,
    };
  }
  return null;
}

function containsTerm(text: string, term: string): boolean {
  const escaped = term.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  return new RegExp(`\\b${escaped}\\b`, 'i').test(text);
}

function normalizeLabel(value: string): string {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}
