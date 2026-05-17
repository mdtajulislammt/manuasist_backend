import type { DishClassification } from '../schemas';

export type NaiInput = {
  dietScore: number;
  nutritionConfidence?: number | null;
  calories?: number;
  calorieTarget?: number | null;
  weightGoal?: string | null;
  category: DishClassification['category'];
  allergenFlags?: Record<string, boolean>;
  allergies?: string[];
};

export type NaiFactorBreakdown = {
  preferenceAlignment: number;
  nutritionConfidence: number;
  macroFit: number;
  allergenPenalty: number;
};

export type NaiResult = {
  naiScore: number;
  factors: NaiFactorBreakdown;
};

function clamp(n: number, min = 0, max = 100): number {
  return Math.max(min, Math.min(max, Math.round(n)));
}

function macroFitScore(calories: number, calorieTarget: number | null | undefined, weightGoal: string | null | undefined): number {
  if (!calorieTarget || calorieTarget <= 0) {
    return 70;
  }
  const ratio = calories / calorieTarget;
  if (weightGoal === 'LOSE') {
    if (ratio <= 0.35) return 90;
    if (ratio <= 0.55) return 75;
    if (ratio <= 0.75) return 55;
    return 35;
  }
  if (weightGoal === 'GAIN') {
    if (ratio >= 0.45 && ratio <= 0.85) return 85;
    if (ratio < 0.35) return 50;
    return 60;
  }
  if (ratio >= 0.35 && ratio <= 0.65) return 85;
  if (ratio > 0.85) return 45;
  return 65;
}

function allergenPenalty(
  flags: Record<string, boolean> | undefined,
  allergies: string[] | undefined,
): number {
  if (!flags || !Object.keys(flags).length) {
    return 0;
  }
  const allergySet = new Set((allergies ?? []).map((a) => a.toLowerCase()));
  let penalty = 0;
  for (const [key, active] of Object.entries(flags)) {
    if (!active) continue;
    const k = key.toLowerCase();
    if (allergySet.size > 0) {
      for (const a of allergySet) {
        if (k.includes(a) || a.includes(k.replace(/possible|mention/g, ''))) {
          penalty += 25;
        }
      }
    } else {
      penalty += 10;
    }
  }
  return Math.min(40, penalty);
}

export function computeDishNai(input: NaiInput): NaiResult {
  const preferenceAlignment = clamp(input.dietScore);
  const nutritionConfidence = clamp((input.nutritionConfidence ?? 0.2) * 100);
  const macroFit = macroFitScore(
    input.calories ?? 250,
    input.calorieTarget,
    input.weightGoal,
  );
  const penalty = allergenPenalty(input.allergenFlags, input.allergies);
  const categoryBoost =
    input.category === 'RECOMMENDED' ? 5 : input.category === 'AVOID' ? -15 : 0;

  const raw =
    preferenceAlignment * 0.45 +
    nutritionConfidence * 0.15 +
    macroFit * 0.25 +
    (100 - penalty) * 0.15 +
    categoryBoost;

  const factors: NaiFactorBreakdown = {
    preferenceAlignment,
    nutritionConfidence,
    macroFit,
    allergenPenalty: penalty,
  };

  return {
    naiScore: clamp(raw),
    factors,
  };
}

export function computeScanNai(
  dishScores: number[],
  topN = 3,
): { naiScore: number; breakdown: Record<string, unknown> } {
  if (dishScores.length === 0) {
    return { naiScore: 0, breakdown: { method: 'empty', dishCount: 0 } };
  }
  const sorted = [...dishScores].sort((a, b) => b - a);
  const top = sorted.slice(0, topN);
  const avg = top.reduce((s, n) => s + n, 0) / top.length;
  return {
    naiScore: clamp(avg),
    breakdown: {
      method: 'top_dishes_average',
      topN,
      topScores: top,
      dishCount: dishScores.length,
    },
  };
}
