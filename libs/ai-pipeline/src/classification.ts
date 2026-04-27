import { LlmClient } from './llm-client';
import {
  dishClassificationSchema,
  type DishClassification,
  type ExtractedDishLine,
} from './schemas';

export type UserPreferenceHints = {
  dietType?: string | null;
  spiceLevel?: string | null;
  weightGoal?: string | null;
};

const SYSTEM = `You classify a single menu item for a diner with known preferences.
Return JSON only: { "category": "RECOMMENDED" | "CAUTION" | "AVOID", "dietScore": 0-100, "allergenFlags"?: { [allergen: string]: boolean } }
RECOMMENDED = likely fits their goals; CAUTION = uncertain or moderate concern; AVOID = likely conflicts (allergens, diet conflict).`;

/**
 * Rule-based fallback when LLM is unavailable: neutral CAUTION, score 50.
 */
export function classifyDishHeuristic(
  dish: ExtractedDishLine,
  _prefs: UserPreferenceHints,
): DishClassification {
  const name = dish.name.toLowerCase();
  const flags: Record<string, boolean> = {};
  if (/\b(peanut|tree nut|shellfish|dairy|gluten)\b/i.test(name)) {
    flags.possibleAllergenMention = true;
  }
  return {
    category: 'CAUTION',
    dietScore: 55,
    allergenFlags: Object.keys(flags).length ? flags : undefined,
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
  return llm.completeJson(
    [
      { role: 'system', content: SYSTEM },
      {
        role: 'user',
        content: `Preferences: ${prefText}\n\nDish: ${dish.name}${dish.description ? `\nDescription: ${dish.description}` : ''}`,
      },
    ],
    dishClassificationSchema,
  );
}
