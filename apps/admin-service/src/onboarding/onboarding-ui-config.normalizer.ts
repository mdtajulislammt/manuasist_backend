import { BadRequestException } from '@nestjs/common';
import { assertValidOnboardingUiConfig } from './onboarding-ui-config.validator';

function isPlainObject(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null && !Array.isArray(v);
}

function isNonEmptyString(v: unknown): v is string {
  return typeof v === 'string' && v.trim().length > 0;
}

/** Stable snake_case identifier for onboarding field/option keys. */
export function slugifyOnboardingKey(input: string): string {
  const slug = input
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '')
    .replace(/_+/g, '_');
  return slug.length > 0 ? slug : 'field';
}

function uniqueKey(base: string, used: Set<string>): string {
  let key = base;
  let suffix = 2;
  while (used.has(key)) {
    key = `${base}_${suffix}`;
    suffix += 1;
  }
  used.add(key);
  return key;
}

function fieldKeyFromLabel(label: string, unit?: unknown): string {
  const base = slugifyOnboardingKey(label);
  if (typeof unit === 'string' && unit.trim()) {
    const unitSlug = slugifyOnboardingKey(unit);
    if (unitSlug && unitSlug !== base) {
      return `${base}_${unitSlug}`;
    }
  }
  return base;
}

function normalizeFieldKeys(
  fields: unknown[],
  includeUnitInKey: boolean,
): Record<string, unknown>[] {
  const used = new Set<string>();
  return fields.map((raw) => {
    if (!isPlainObject(raw)) {
      return raw as Record<string, unknown>;
    }
    const label = raw.label;
    if (!isNonEmptyString(label)) {
      return { ...raw };
    }
    const existingKey = isNonEmptyString(raw.key) ? raw.key.trim() : null;
    const generated = uniqueKey(
      fieldKeyFromLabel(label, includeUnitInKey ? raw.unit : undefined),
      used,
    );
    return {
      ...raw,
      key: existingKey ?? generated,
    };
  });
}

function normalizeCardOptions(options: unknown[]): Record<string, unknown>[] {
  const used = new Set<string>();
  return options.map((raw) => {
    if (!isPlainObject(raw)) {
      return raw as Record<string, unknown>;
    }
    const label = raw.label;
    const existingValue = isNonEmptyString(raw.value) ? raw.value.trim() : null;
    const generated =
      isNonEmptyString(label) ?
        uniqueKey(slugifyOnboardingKey(label), used)
      : null;
    return {
      ...raw,
      ...(existingValue || generated ?
        { value: existingValue ?? generated }
      : {}),
    };
  });
}

/**
 * Fills missing stable keys/values in uiConfig before persistence or API response.
 * - multi_slider / multi_scale: `fields[].key` from label (+ unit for sliders)
 * - card kinds: `options[].value` from label when omitted
 */
export function normalizeOnboardingUiConfig(
  uiConfig: unknown,
): Record<string, unknown> | undefined {
  if (uiConfig === undefined || uiConfig === null) {
    return undefined;
  }
  if (!isPlainObject(uiConfig)) {
    return uiConfig as Record<string, unknown>;
  }

  const kind = isNonEmptyString(uiConfig.kind) ? uiConfig.kind.trim() : '';
  const out: Record<string, unknown> = { ...uiConfig };

  if (kind === 'multi_slider' && Array.isArray(out.fields)) {
    out.fields = normalizeFieldKeys(out.fields, true);
  }

  if (kind === 'multi_scale' && Array.isArray(out.fields)) {
    out.fields = normalizeFieldKeys(out.fields, false);
  }

  if (
    (kind === 'single_select_cards' || kind === 'multi_select_cards') &&
    Array.isArray(out.options)
  ) {
    out.options = normalizeCardOptions(out.options);
  }

  return out;
}

/** Normalize uiConfig then run full validation (for create/update). */
export function prepareOnboardingUiConfig(
  uiConfig: unknown,
): Record<string, unknown> | undefined {
  const normalized = normalizeOnboardingUiConfig(uiConfig);
  if (normalized === undefined) {
    return undefined;
  }
  assertValidOnboardingUiConfig(normalized, { requireStableKeys: true });
  return normalized;
}

export function enrichStepUiConfigForResponse(
  uiConfig: unknown,
): Record<string, unknown> | null {
  if (uiConfig === null || uiConfig === undefined) {
    return null;
  }
  try {
    return normalizeOnboardingUiConfig(uiConfig) ?? null;
  } catch {
    return isPlainObject(uiConfig) ? uiConfig : null;
  }
}

export function assertUniqueFieldKeys(fields: unknown[], path: string): void {
  const seen = new Set<string>();
  fields.forEach((raw, i) => {
    if (!isPlainObject(raw) || !isNonEmptyString(raw.key)) {
      throw new BadRequestException(`${path}[${i}].key must be a non-empty string`);
    }
    const key = raw.key.trim();
    if (seen.has(key)) {
      throw new BadRequestException(`${path} contains duplicate key "${key}"`);
    }
    seen.add(key);
  });
}
