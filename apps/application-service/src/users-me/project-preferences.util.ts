import { Prisma } from '../../generated/prisma/client';
import { SpiceLevel, WeightGoal } from '../../generated/prisma/enums';

export type ProjectedPreferences = {
  dietType?: string;
  calorieTarget?: number;
  spiceLevel?: SpiceLevel;
  weightGoal?: WeightGoal;
};

function isSpiceLevel(v: string): v is SpiceLevel {
  return (Object.values(SpiceLevel) as string[]).includes(v);
}

function isWeightGoal(v: string): v is WeightGoal {
  return (Object.values(WeightGoal) as string[]).includes(v);
}

export function projectPreferencesFromValue(value: unknown): ProjectedPreferences {
  const data: ProjectedPreferences = {};
  if (value === null || value === undefined) {
    return data;
  }
  if (typeof value !== 'object' || Array.isArray(value)) {
    return data;
  }
  const o = value as Record<string, unknown>;
  if (typeof o.dietType === 'string') {
    data.dietType = o.dietType;
  }
  if (typeof o.calorieTarget === 'number' && Number.isInteger(o.calorieTarget)) {
    data.calorieTarget = o.calorieTarget;
  }
  if (typeof o.spiceLevel === 'string' && isSpiceLevel(o.spiceLevel)) {
    data.spiceLevel = o.spiceLevel;
  }
  if (typeof o.weightGoal === 'string' && isWeightGoal(o.weightGoal)) {
    data.weightGoal = o.weightGoal;
  }
  return data;
}

export function mergePreferenceUpdates(
  updates: ProjectedPreferences[],
): ProjectedPreferences {
  return updates.reduce<ProjectedPreferences>(
    (acc, update) => ({ ...acc, ...update }),
    {},
  );
}

export function toPreferencesUpdateInput(
  projected: ProjectedPreferences,
): Prisma.PreferencesUpdateInput {
  return projected;
}
