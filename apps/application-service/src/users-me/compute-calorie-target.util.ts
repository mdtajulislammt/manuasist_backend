import { WeightGoal } from '../../generated/prisma/enums';
import type { AdminActiveFlowPayload } from '../admin-internal/admin-internal-client.service';

export type BiometricInput = {
  heightCm: number;
  weightKg: number;
  age: number;
  gender: 'male' | 'female' | null;
  weightGoal: WeightGoal | null;
};

function readPositiveNumber(value: unknown): number | null {
  if (typeof value !== 'number' || !Number.isFinite(value) || value <= 0) {
    return null;
  }
  return value;
}

function readNumericField(
  obj: Record<string, unknown>,
  keys: string[],
): number | null {
  for (const key of keys) {
    const value = readPositiveNumber(obj[key]);
    if (value !== null) {
      return value;
    }
  }
  return null;
}

function readNumericFieldByKeyHint(
  obj: Record<string, unknown>,
  hints: string[],
): number | null {
  for (const [key, raw] of Object.entries(obj)) {
    const normalized = key.toLowerCase();
    if (!hints.some((hint) => normalized.includes(hint))) {
      continue;
    }
    const value = readPositiveNumber(raw);
    if (value !== null) {
      return value;
    }
  }
  return null;
}

function normalizeGender(value: unknown): 'male' | 'female' | null {
  if (typeof value !== 'string') {
    return null;
  }
  const normalized = value.trim().toLowerCase();
  if (normalized === 'male' || normalized === 'm') {
    return 'male';
  }
  if (normalized === 'female' || normalized === 'f') {
    return 'female';
  }
  return null;
}

function fieldKeysFromUiConfig(
  uiConfig: Record<string, unknown> | null,
  labelHints: string[],
): string[] {
  if (!uiConfig || !Array.isArray(uiConfig.fields)) {
    return [];
  }
  const keys: string[] = [];
  for (const raw of uiConfig.fields) {
    if (!raw || typeof raw !== 'object') {
      continue;
    }
    const field = raw as Record<string, unknown>;
    const label =
      typeof field.label === 'string' ? field.label.toLowerCase() : '';
    if (!labelHints.some((hint) => label.includes(hint))) {
      continue;
    }
    if (typeof field.key === 'string' && field.key.trim()) {
      keys.push(field.key.trim());
    }
  }
  return keys;
}

export function extractBiometricsFromOnboarding(
  flow: AdminActiveFlowPayload,
  answers: Array<{ stepKey: string; value: unknown }>,
): Omit<BiometricInput, 'weightGoal'> | null {
  const answerByStep = new Map(answers.map((row) => [row.stepKey, row.value]));
  let heightCm: number | null = null;
  let weightKg: number | null = null;
  let age: number | null = null;
  let gender: 'male' | 'female' | null = null;

  for (const step of flow.steps) {
    const value = answerByStep.get(step.id);
    if (value === undefined || value === null) {
      continue;
    }
    const uiConfig = step.uiConfig;
    const kind =
      uiConfig && typeof uiConfig.kind === 'string' ? uiConfig.kind : null;

    if (kind === 'multi_slider' && typeof value === 'object' && !Array.isArray(value)) {
      const obj = value as Record<string, unknown>;
      const heightKeys = [
        ...fieldKeysFromUiConfig(uiConfig, ['height']),
        'height',
        'heightCm',
        'height_cm',
      ];
      const weightKeys = [
        ...fieldKeysFromUiConfig(uiConfig, ['weight']),
        'weight',
        'weightKg',
        'weight_kg',
      ];
      const ageKeys = [
        ...fieldKeysFromUiConfig(uiConfig, ['age']),
        'age',
        'ageYears',
        'age_years',
      ];
      heightCm =
        heightCm ??
        readNumericField(obj, heightKeys) ??
        readNumericFieldByKeyHint(obj, ['height']);
      weightKg =
        weightKg ??
        readNumericField(obj, weightKeys) ??
        readNumericFieldByKeyHint(obj, ['weight']);
      age =
        age ??
        readNumericField(obj, ageKeys) ??
        readNumericFieldByKeyHint(obj, ['age']);
    }

    if (kind === 'single_select_cards') {
      const selected =
        typeof value === 'string'
          ? value
          : typeof value === 'object' &&
              value !== null &&
              !Array.isArray(value) &&
              typeof (value as Record<string, unknown>).value === 'string'
            ? String((value as Record<string, unknown>).value)
            : null;
      if (selected) {
        const title = step.title.toLowerCase();
        if (title.includes('gender')) {
          gender = normalizeGender(selected) ?? gender;
        }
      }
    }
  }

  if (heightCm === null || weightKg === null || age === null) {
    return null;
  }

  return { heightCm, weightKg, age, gender };
}

function activityFactor(weightGoal: WeightGoal | null): number {
  switch (weightGoal) {
    case WeightGoal.LOSE:
      return 1.2;
    case WeightGoal.GAIN:
      return 1.55;
    case WeightGoal.MAINTAIN:
    default:
      return 1.375;
  }
}

/** Mifflin-St Jeor BMR with light activity factor; deficit applied for LOSE. */
export function computeCalorieTargetFromBiometrics(
  input: BiometricInput,
): number | null {
  const { heightCm, weightKg, age, gender, weightGoal } = input;
  if (heightCm <= 0 || weightKg <= 0 || age <= 0) {
    return null;
  }

  const baseBmr =
    gender === 'female'
      ? 10 * weightKg + 6.25 * heightCm - 5 * age - 161
      : 10 * weightKg + 6.25 * heightCm - 5 * age + 5;

  let calories = Math.round(baseBmr * activityFactor(weightGoal));
  if (weightGoal === WeightGoal.LOSE) {
    calories = Math.max(1200, calories - 500);
  }
  return calories > 0 ? calories : null;
}
