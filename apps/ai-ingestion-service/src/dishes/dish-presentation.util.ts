import { DishCategory } from '../../generated/prisma/enums';

type JsonRecord = Record<string, unknown>;

export type DishPresentationSource = {
  id: string;
  name: string;
  imageUrl: string | null;
  calories: number;
  dietScore: number;
  naiScore: number | null;
  category: DishCategory;
  allergenFlags: unknown;
  explanation: unknown;
  macros: unknown;
};

export function buildDishTags(dish: DishPresentationSource): string[] {
  const tags: string[] = [];

  if (dish.category === DishCategory.RECOMMENDED) {
    pushUnique(tags, 'Best Match');
  } else if (dish.category === DishCategory.CAUTION) {
    pushUnique(tags, 'Review First');
  } else if (dish.category === DishCategory.AVOID) {
    pushUnique(tags, 'Avoid');
  }

  const macros = asRecord(dish.macros);
  const proteinG = numberValue(macros?.proteinG);
  const carbG = numberValue(macros?.carbG);
  const fatG = numberValue(macros?.fatG);

  if (proteinG !== null && proteinG >= 20) {
    pushUnique(tags, 'High Protein');
  } else if (proteinG !== null && proteinG >= 10) {
    pushUnique(tags, 'Protein Source');
  }
  if (carbG !== null && carbG <= 20) {
    pushUnique(tags, 'Low Carb');
  }
  if (fatG !== null && fatG <= 10) {
    pushUnique(tags, 'Low Fat');
  }
  if (dish.calories <= 450) {
    pushUnique(tags, 'Light Option');
  }

  const allergenFlags = asRecord(dish.allergenFlags);
  const hasAllergenAlert =
    allergenFlags &&
    Object.values(allergenFlags).some((value) => value === true);
  if (hasAllergenAlert) {
    pushUnique(tags, 'Allergen Alert');
  }

  return tags.slice(0, 3);
}

export function buildDishDescription(dish: DishPresentationSource): string {
  const explanation = asRecord(dish.explanation);
  const summary = stringValue(explanation?.summary);
  if (summary) {
    return summary;
  }

  const reasons = stringArrayValue(explanation?.reasons);
  if (reasons.length > 0) {
    return reasons[0];
  }

  if (dish.category === DishCategory.RECOMMENDED) {
    return 'A strong match for your dietary profile.';
  }
  if (dish.category === DishCategory.CAUTION) {
    return 'Review this dish before ordering.';
  }
  return 'This dish may not align with your dietary profile.';
}

export function extractDishMacros(dish: DishPresentationSource) {
  const macros = asRecord(dish.macros);
  return {
    proteinG: numberValue(macros?.proteinG),
    carbG: numberValue(macros?.carbG),
    fatG: numberValue(macros?.fatG),
  };
}

export function extractAllergenFlags(
  value: unknown,
): Record<string, boolean> | undefined {
  const record = asRecord(value);
  if (!record) {
    return undefined;
  }
  const out: Record<string, boolean> = {};
  for (const [key, flag] of Object.entries(record)) {
    if (typeof flag === 'boolean') {
      out[key] = flag;
    }
  }
  return Object.keys(out).length > 0 ? out : undefined;
}

function asRecord(value: unknown): JsonRecord | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return null;
  }
  return value as JsonRecord;
}

function numberValue(value: unknown): number | null {
  return typeof value === 'number' && Number.isFinite(value) ? value : null;
}

function stringValue(value: unknown): string | null {
  if (typeof value !== 'string') {
    return null;
  }
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

function stringArrayValue(value: unknown): string[] {
  if (!Array.isArray(value)) {
    return [];
  }
  return value
    .map((item) => stringValue(item))
    .filter((item): item is string => item !== null);
}

function pushUnique(values: string[], value: string) {
  if (!values.includes(value)) {
    values.push(value);
  }
}
