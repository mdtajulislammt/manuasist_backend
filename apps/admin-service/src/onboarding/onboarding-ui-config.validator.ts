import { BadRequestException } from '@nestjs/common';

/** `uiConfig.kind` values aligned with `steps.txt` onboarding examples. */
export const ONBOARDING_UI_CONFIG_KINDS = [
  'single_select',
  'multi_slider',
  'single_select_cards',
  'multi_select_cards',
  'multi_scale',
] as const;

export type OnboardingUiConfigKind = (typeof ONBOARDING_UI_CONFIG_KINDS)[number];

function isPlainObject(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null && !Array.isArray(v);
}

function isNonEmptyString(v: unknown): v is string {
  return typeof v === 'string' && v.trim().length > 0;
}

function isFiniteNumber(v: unknown): v is number {
  return typeof v === 'number' && Number.isFinite(v);
}

function optionValues(
  options: unknown[],
  path: string,
  requireValue: boolean,
): { value: string; label: string; icon?: string }[] {
  const out: { value: string; label: string; icon?: string }[] = [];
  options.forEach((raw, i) => {
    const p = `${path}[${i}]`;
    if (!isPlainObject(raw)) {
      throw new BadRequestException(`${p} must be an object with value and label`);
    }
    if (requireValue && !isNonEmptyString(raw.value)) {
      throw new BadRequestException(`${p}.value must be a non-empty string`);
    }
    if (!isNonEmptyString(raw.label)) {
      throw new BadRequestException(`${p}.label must be a non-empty string`);
    }
    if (raw.icon !== undefined && raw.icon !== null) {
      if (typeof raw.icon !== 'string' || !raw.icon.trim()) {
        throw new BadRequestException(`${p}.icon must be a non-empty string when set`);
      }
      out.push({
        value: isNonEmptyString(raw.value) ? raw.value.trim() : '',
        label: raw.label.trim(),
        icon: raw.icon.trim(),
      });
    } else {
      out.push({
        value: isNonEmptyString(raw.value) ? raw.value.trim() : '',
        label: raw.label.trim(),
      });
    }
  });
  return out;
}

function validateSingleSelect(obj: Record<string, unknown>) {
  if (!Array.isArray(obj.options) || obj.options.length === 0) {
    throw new BadRequestException('uiConfig.options must be a non-empty array of strings');
  }
  obj.options.forEach((opt, i) => {
    if (!isNonEmptyString(opt)) {
      throw new BadRequestException(`uiConfig.options[${i}] must be a non-empty string`);
    }
  });
}

function normalizeOptionalIcon(
  raw: unknown,
  path: string,
): string | undefined {
  if (raw === undefined || raw === null) {
    return undefined;
  }
  if (typeof raw === 'string') {
    const trimmed = raw.trim();
    if (!trimmed) {
      return undefined;
    }
    return trimmed;
  }
  if (isPlainObject(raw)) {
    const fromObject = [raw.iconUrl, raw.icon, raw.filename, raw.id].find(
      (value) => typeof value === 'string' && value.trim().length > 0,
    );
    if (typeof fromObject === 'string') {
      return fromObject.trim();
    }
  }
  throw new BadRequestException(
    `${path} must be a non-empty string (asset key, image URL, or stored filename) when set`,
  );
}

function validateMultiSlider(
  obj: Record<string, unknown>,
  requireStableKeys: boolean,
) {
  if (!Array.isArray(obj.fields) || obj.fields.length === 0) {
    throw new BadRequestException('uiConfig.fields must be a non-empty array');
  }
  obj.fields.forEach((raw, i) => {
    const p = `uiConfig.fields[${i}]`;
    if (!isPlainObject(raw)) {
      throw new BadRequestException(`${p} must be an object`);
    }
    if (requireStableKeys && !isNonEmptyString(raw.key)) {
      throw new BadRequestException(`${p}.key must be a non-empty string`);
    }
    if (!isNonEmptyString(raw.label)) {
      throw new BadRequestException(`${p}.label must be a non-empty string`);
    }
    for (const k of ['min', 'max', 'step', 'default'] as const) {
      if (!isFiniteNumber(raw[k])) {
        throw new BadRequestException(`${p}.${k} must be a finite number`);
      }
    }
    if (raw.unit !== undefined && raw.unit !== null && typeof raw.unit !== 'string') {
      throw new BadRequestException(`${p}.unit must be a string when set`);
    }
    if (raw.leftCaption !== undefined && raw.leftCaption !== null && typeof raw.leftCaption !== 'string') {
      throw new BadRequestException(`${p}.leftCaption must be a string when set`);
    }
    if (raw.rightCaption !== undefined && raw.rightCaption !== null && typeof raw.rightCaption !== 'string') {
      throw new BadRequestException(`${p}.rightCaption must be a string when set`);
    }
    const icon = normalizeOptionalIcon(raw.icon, `${p}.icon`);
    if (icon) {
      raw.icon = icon;
    } else {
      delete raw.icon;
    }
  });
}

function validateSelectionBlock(sel: unknown, ctx: string, allowedModes: ('single' | 'multiple')[]) {
  if (!isPlainObject(sel)) {
    throw new BadRequestException(`${ctx} must be an object`);
  }
  if (!isNonEmptyString(sel.mode) || !allowedModes.includes(sel.mode as 'single' | 'multiple')) {
    throw new BadRequestException(`${ctx}.mode must be one of: ${allowedModes.join(', ')}`);
  }
  if (typeof sel.required !== 'boolean') {
    throw new BadRequestException(`${ctx}.required must be a boolean`);
  }
  if (sel.mode === 'multiple') {
    if (sel.minSelections !== undefined && !isFiniteNumber(sel.minSelections)) {
      throw new BadRequestException(`${ctx}.minSelections must be a number when set`);
    }
    if (sel.maxSelections !== undefined && !isFiniteNumber(sel.maxSelections)) {
      throw new BadRequestException(`${ctx}.maxSelections must be a number when set`);
    }
  }
}

function validateSingleSelectCards(
  obj: Record<string, unknown>,
  requireStableKeys: boolean,
) {
  validateSelectionBlock(obj.selection, 'uiConfig.selection', ['single']);
  if (!Array.isArray(obj.options) || obj.options.length === 0) {
    throw new BadRequestException('uiConfig.options must be a non-empty array');
  }
  const opts = optionValues(
    obj.options as unknown[],
    'uiConfig.options',
    requireStableKeys,
  );
  if (!isNonEmptyString(obj.defaultValue)) {
    throw new BadRequestException('uiConfig.defaultValue must be a non-empty string');
  }
  const values = [...new Set(opts.map((o) => o.value).filter(Boolean))];
  const defaultVal = (obj.defaultValue as string).trim();
  if (requireStableKeys && values.length !== opts.length) {
    throw new BadRequestException(
      'uiConfig.options[].value must be set for every option (or omit to auto-generate from label)',
    );
  }
  if (!values.includes(defaultVal)) {
    throw new BadRequestException(
      `uiConfig.defaultValue "${defaultVal}" must match one of uiConfig.options[].value ` +
        `(allowed: ${values.join(', ')})`,
    );
  }
}

function validateMultiSelectCards(
  obj: Record<string, unknown>,
  requireStableKeys: boolean,
) {
  validateSelectionBlock(obj.selection, 'uiConfig.selection', ['multiple']);
  if (!Array.isArray(obj.options) || obj.options.length === 0) {
    throw new BadRequestException('uiConfig.options must be a non-empty array');
  }
  const opts = optionValues(
    obj.options as unknown[],
    'uiConfig.options',
    requireStableKeys,
  );
  const valueSet = new Set(opts.map((o) => o.value).filter(Boolean));
  if (requireStableKeys && valueSet.size !== opts.length) {
    throw new BadRequestException(
      'uiConfig.options[].value must be set for every option (or omit to auto-generate from label)',
    );
  }
  if (!Array.isArray(obj.defaultValues)) {
    throw new BadRequestException('uiConfig.defaultValues must be an array of strings');
  }
  (obj.defaultValues as unknown[]).forEach((v, i) => {
    if (!isNonEmptyString(v)) {
      throw new BadRequestException(`uiConfig.defaultValues[${i}] must be a non-empty string`);
    }
    const trimmed = v.trim();
    if (!valueSet.has(trimmed)) {
      throw new BadRequestException(
        `uiConfig.defaultValues[${i}] "${trimmed}" must match one of uiConfig.options[].value ` +
          `(allowed: ${[...valueSet].join(', ')})`,
      );
    }
  });
}

function validateMultiScale(
  obj: Record<string, unknown>,
  requireStableKeys: boolean,
) {
  if (!Array.isArray(obj.fields) || obj.fields.length === 0) {
    throw new BadRequestException('uiConfig.fields must be a non-empty array');
  }
  obj.fields.forEach((raw, i) => {
    const p = `uiConfig.fields[${i}]`;
    if (!isPlainObject(raw)) {
      throw new BadRequestException(`${p} must be an object`);
    }
    if (requireStableKeys && !isNonEmptyString(raw.key)) {
      throw new BadRequestException(`${p}.key must be a non-empty string`);
    }
    if (!isNonEmptyString(raw.label)) {
      throw new BadRequestException(`${p}.label must be a non-empty string`);
    }
    if (!isNonEmptyString(raw.defaultValue)) {
      throw new BadRequestException(`${p}.defaultValue must be a non-empty string`);
    }
    if (!Array.isArray(raw.scale) || raw.scale.length < 2) {
      throw new BadRequestException(`${p}.scale must be an array with at least 2 entries`);
    }
    raw.scale.forEach((s, j) => {
      if (!isNonEmptyString(s)) {
        throw new BadRequestException(`${p}.scale[${j}] must be a non-empty string`);
      }
    });
    const allowed = new Set((raw.scale as string[]).map((s) => s.trim()));
    if (!allowed.has((raw.defaultValue as string).trim())) {
      throw new BadRequestException(`${p}.defaultValue must be one of ${p}.scale values`);
    }
  });

  if (obj.cta !== undefined && obj.cta !== null) {
    if (!isPlainObject(obj.cta)) {
      throw new BadRequestException('uiConfig.cta must be an object when set');
    }
    if (!isNonEmptyString(obj.cta.label)) {
      throw new BadRequestException('uiConfig.cta.label must be a non-empty string');
    }
    if (!isNonEmptyString(obj.cta.action)) {
      throw new BadRequestException('uiConfig.cta.action must be a non-empty string');
    }
  }
}

/**
 * Validates `uiConfig` when present. Matches the onboarding step JSON shapes in `steps.txt`
 * (single_select, multi_slider, single_select_cards, multi_select_cards, multi_scale).
 * Optional `icon` is allowed on card `options[]` and multi_slider `fields[]`
 * (string: asset key, image URL, or stored filename).
 * Field keys and option values may be omitted on input; use `prepareOnboardingUiConfig` to generate them.
 */
export function assertValidOnboardingUiConfig(
  uiConfig: unknown,
  options: { requireStableKeys?: boolean } = {},
): void {
  const requireStableKeys = options.requireStableKeys ?? false;
  if (uiConfig === undefined || uiConfig === null) {
    return;
  }
  if (!isPlainObject(uiConfig)) {
    throw new BadRequestException('uiConfig must be a JSON object');
  }
  if (!isNonEmptyString(uiConfig.kind)) {
    throw new BadRequestException(
      `uiConfig.kind is required and must be one of: ${ONBOARDING_UI_CONFIG_KINDS.join(', ')}`,
    );
  }
  const kind = uiConfig.kind.trim() as OnboardingUiConfigKind;
  if (!ONBOARDING_UI_CONFIG_KINDS.includes(kind)) {
    throw new BadRequestException(
      `uiConfig.kind must be one of: ${ONBOARDING_UI_CONFIG_KINDS.join(', ')}`,
    );
  }
  switch (kind) {
    case 'single_select':
      validateSingleSelect(uiConfig);
      break;
    case 'multi_slider':
      validateMultiSlider(uiConfig, requireStableKeys);
      break;
    case 'single_select_cards':
      validateSingleSelectCards(uiConfig, requireStableKeys);
      break;
    case 'multi_select_cards':
      validateMultiSelectCards(uiConfig, requireStableKeys);
      break;
    case 'multi_scale':
      validateMultiScale(uiConfig, requireStableKeys);
      break;
  }
}
