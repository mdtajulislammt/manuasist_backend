import type { AdminOnboardingStep } from '../admin-internal/admin-internal-client.service';

type OnboardingAnswer = {
  stepKey: string;
  value: unknown;
};

const RESTRICTION_STEP_PATTERN =
  /(allerg(?:y|ies|en|ens)|intoleran(?:ce|ces|t))/i;

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
  const restrictionStepIds = new Set(
    steps.filter(isRestrictionStep).map((step) => step.id),
  );
  const restrictions = new Set<string>();

  for (const answer of answers) {
    const value = answer.value;

    if (restrictionStepIds.has(answer.stepKey) && Array.isArray(value)) {
      addStrings(restrictions, value);
    }

    if (isRecord(value)) {
      addStrings(restrictions, value.allergies);
      addStrings(restrictions, value.intolerances);
    }
  }

  return [...restrictions];
}

function isRestrictionStep(
  step: Pick<AdminOnboardingStep, 'title' | 'uiConfig'>,
): boolean {
  if (RESTRICTION_STEP_PATTERN.test(step.title)) {
    return true;
  }

  const config = step.uiConfig;
  if (!config) {
    return false;
  }

  const semanticValues = [
    config.semanticType,
    config.profileField,
    config.answerKey,
  ];
  return semanticValues.some(
    (value) =>
      typeof value === 'string' && RESTRICTION_STEP_PATTERN.test(value),
  );
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

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}
