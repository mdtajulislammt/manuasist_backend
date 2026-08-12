import type { AdminOnboardingStep } from '../admin-internal/admin-internal-client.service';

type OnboardingAnswer = {
  stepKey: string;
  value: unknown;
};

export type DietaryProfileAnswers = {
  allergies: string[];
  intolerances: string[];
  cuisinePreferences: string[];
  healthObjectives: string[];
  nutritionTargets: Record<string, string | number | boolean>;
};

const ALLERGY_PATTERN = /allerg(?:y|ies|en|ens)/i;
const INTOLERANCE_PATTERN = /intoleran(?:ce|ces|t)/i;
const CUISINE_PATTERN = /cuisine/i;
const HEALTH_OBJECTIVE_PATTERN =
  /(diet goals?|health goals?|health objectives?|fitness goals?|what is your goal)/i;
const NUTRITION_TARGET_PATTERN =
  /(nutrition(?:al)? (?:preferences?|targets?)|macro targets?)/i;

/**
 * Extract allergy/intolerance selections only from semantically matching
 * onboarding steps. A generic array is not enough: cuisine preferences and
 * other multi-select answers use the same storage shape.
 *
 * Explicit `{ allergies: [...] }` / `{ intolerances: [...] }` payloads remain
 * supported because their meaning is unambiguous even without step metadata.
 */
export function extractDietaryRestrictions(
  answers: OnboardingAnswer[],
  steps: Pick<AdminOnboardingStep, 'id' | 'title' | 'uiConfig'>[],
): string[] {
  const profile = extractDietaryProfileAnswers(answers, steps);
  return unique([...profile.allergies, ...profile.intolerances]);
}

/**
 * Project dynamic onboarding answers into explicit dietary domains. Step
 * metadata is required for ambiguous primitive/list values; structured object
 * keys are accepted directly because their meaning is unambiguous.
 */
export function extractDietaryProfileAnswers(
  answers: OnboardingAnswer[],
  steps: Pick<AdminOnboardingStep, 'id' | 'title' | 'uiConfig'>[],
): DietaryProfileAnswers {
  const stepById = new Map(steps.map((step) => [step.id, step]));
  const allergies = new Set<string>();
  const intolerances = new Set<string>();
  const cuisinePreferences = new Set<string>();
  const healthObjectives = new Set<string>();
  const nutritionTargets: Record<string, string | number | boolean> = {};

  for (const answer of answers) {
    const value = answer.value;
    const step = stepById.get(answer.stepKey);
    const semantics = step ? semanticText(step) : '';

    if (step && ALLERGY_PATTERN.test(semantics)) {
      addAnswerStrings(allergies, value);
    }
    if (step && INTOLERANCE_PATTERN.test(semantics)) {
      // A combined "allergies or intolerances" step cannot safely distinguish
      // individual selections, so retain them in allergies for hard-safety
      // behavior while keeping explicitly keyed intolerances separate.
      if (!ALLERGY_PATTERN.test(semantics)) {
        addAnswerStrings(intolerances, value);
      }
    }
    if (step && CUISINE_PATTERN.test(semantics)) {
      addAnswerStrings(cuisinePreferences, value);
    }
    if (step && HEALTH_OBJECTIVE_PATTERN.test(semantics)) {
      addAnswerStrings(healthObjectives, value);
    }
    if (step && NUTRITION_TARGET_PATTERN.test(semantics) && isRecord(value)) {
      addPrimitiveEntries(nutritionTargets, value);
    }

    if (isRecord(value)) {
      addStrings(allergies, value.allergies);
      addStrings(intolerances, value.intolerances);
      addStrings(cuisinePreferences, value.cuisinePreferences);
      addStrings(cuisinePreferences, value.cuisines);
      addStrings(healthObjectives, value.healthObjectives);
      addStrings(healthObjectives, value.healthGoals);
      if (isRecord(value.nutritionTargets)) {
        addPrimitiveEntries(nutritionTargets, value.nutritionTargets);
      }
    }
  }

  return {
    allergies: [...allergies],
    intolerances: [...intolerances],
    cuisinePreferences: [...cuisinePreferences],
    healthObjectives: [...healthObjectives],
    nutritionTargets,
  };
}

function semanticText(
  step: Pick<AdminOnboardingStep, 'title' | 'uiConfig'>,
): string {
  const config = step.uiConfig;
  const values = [
    step.title,
    config?.semanticType,
    config?.profileField,
    config?.answerKey,
  ];
  return values.filter((value): value is string => typeof value === 'string').join(' ');
}

function addAnswerStrings(output: Set<string>, value: unknown): void {
  if (typeof value === 'string' && value.trim()) {
    output.add(value.trim());
    return;
  }
  addStrings(output, value);
}

function addStrings(output: Set<string>, value: unknown): void {
  if (!Array.isArray(value)) {
    return;
  }
  for (const item of value) {
    if (typeof item === 'string' && item.trim()) {
      output.add(item.trim());
    }
  }
}

function addPrimitiveEntries(
  output: Record<string, string | number | boolean>,
  value: Record<string, unknown>,
): void {
  for (const [key, entry] of Object.entries(value)) {
    if (
      typeof entry === 'string' ||
      typeof entry === 'number' ||
      typeof entry === 'boolean'
    ) {
      output[key] = entry;
    }
  }
}

function unique(values: string[]): string[] {
  return [...new Set(values)];
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}
