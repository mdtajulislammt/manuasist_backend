import { LlmClient } from './llm-client';
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
};

const SYSTEM = `You classify a single menu item for a diner with known preferences.
Return JSON only:
{
  "category": "RECOMMENDED" | "CAUTION" | "AVOID",
  "dietScore": 0-100,
  "allergenFlags"?: { [allergen: string]: boolean },
  "reasons": [{ "code": "DIET_ALIGN"|"ALLERGEN"|"MACRO"|"SPICE"|"CALORIE"|"UNCERTAIN"|"GENERAL", "severity": "info"|"warning"|"critical", "message": "..." }],
  "summary"?: "one short sentence"
}
RECOMMENDED = likely fits their goals; CAUTION = uncertain or moderate concern; AVOID = likely conflicts (allergens, diet conflict).
Always include at least one reason with a clear message.`;

export function classifyDishHeuristic(
  dish: ExtractedDishLine,
  prefs: UserPreferenceHints,
): DishClassification {
  const name = dish.name.toLowerCase();
  const flags: Record<string, boolean> = {};
  const reasons: DishClassification['reasons'] = [];

  if (/\b(peanut|tree nut|shellfish|dairy|gluten|egg|soy|fish)\b/i.test(name)) {
    flags.possibleAllergenMention = true;
    const allergyHit = (prefs.allergies ?? []).some((a) =>
      name.includes(a.toLowerCase()),
    );
    reasons.push({
      code: 'ALLERGEN',
      severity: allergyHit ? 'critical' : 'warning',
      message: allergyHit
        ? `May contain an allergen you listed (${name})`
        : 'Dish name may reference common allergens',
    });
  }

  if (prefs.dietType) {
    const diet = prefs.dietType.toLowerCase();
    if (diet.includes('vegan') && /\b(chicken|beef|pork|fish|cheese|cream)\b/i.test(name)) {
      reasons.push({
        code: 'DIET_ALIGN',
        severity: 'critical',
        message: `Likely not compatible with ${prefs.dietType} diet`,
      });
    } else {
      reasons.push({
        code: 'DIET_ALIGN',
        severity: 'info',
        message: `Review for ${prefs.dietType} compatibility`,
      });
    }
  }

  if (reasons.length === 0) {
    reasons.push({
      code: 'UNCERTAIN',
      severity: 'info',
      message: 'Limited preference data — review ingredients when ordering',
    });
  }

  return {
    category: reasons.some((r) => r.severity === 'critical') ? 'AVOID' : 'CAUTION',
    dietScore: reasons.some((r) => r.severity === 'critical') ? 35 : 55,
    allergenFlags: Object.keys(flags).length ? flags : undefined,
    reasons,
    summary: `Heuristic classification for ${dish.name}`,
  };
}

export async function classifyDish(
  dish: ExtractedDishLine,
  prefs: UserPreferenceHints,
  llm: LlmClient,
): Promise<DishClassification> {
  if (!llm.isConfigured()) {
    return classifyDishHeuristic(dish, prefs);
  }
  const prefText = JSON.stringify(prefs ?? {});
  const result = await llm.completeJson(
    [
      { role: 'system', content: SYSTEM },
      {
        role: 'user',
        content: `Preferences: ${prefText}\n\nDish: ${dish.name}${dish.description ? `\nDescription: ${dish.description}` : ''}`,
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
