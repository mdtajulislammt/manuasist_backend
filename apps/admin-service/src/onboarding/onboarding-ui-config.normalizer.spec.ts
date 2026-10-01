import {
  normalizeOnboardingUiConfig,
  prepareOnboardingUiConfig,
  slugifyOnboardingKey,
} from './onboarding-ui-config.normalizer';

describe('slugifyOnboardingKey', () => {
  it('converts labels to snake_case', () => {
    expect(slugifyOnboardingKey('Weight Loss')).toBe('weight_loss');
    expect(slugifyOnboardingKey('Height')).toBe('height');
  });
});

describe('normalizeOnboardingUiConfig', () => {
  it('generates multi_slider field keys from label and unit', () => {
    const normalized = normalizeOnboardingUiConfig({
      kind: 'multi_slider',
      fields: [
        {
          label: 'Height',
          unit: 'CM',
          min: 0,
          max: 500,
          step: 1,
          default: 180,
        },
        {
          label: 'Age',
          unit: 'Years',
          min: 0,
          max: 100,
          step: 1,
          default: 56,
        },
      ],
    });

    expect(normalized?.fields).toEqual([
      expect.objectContaining({ key: 'height_cm', label: 'Height' }),
      expect.objectContaining({ key: 'age_years', label: 'Age' }),
    ]);
  });

  it('generates multi_scale field keys from label', () => {
    const normalized = normalizeOnboardingUiConfig({
      kind: 'multi_scale',
      fields: [
        {
          label: 'Carbohydrates',
          scale: ['low', 'moderate', 'high'],
          defaultValue: 'moderate',
        },
      ],
    });

    expect(normalized?.fields).toEqual([
      expect.objectContaining({ key: 'carbohydrates', label: 'Carbohydrates' }),
    ]);
  });

  it('generates card option values from labels when omitted', () => {
    const normalized = normalizeOnboardingUiConfig({
      kind: 'single_select_cards',
      selection: { mode: 'single', required: true },
      options: [
        { label: 'Male', icon: 'male.png' },
        { label: 'Female', icon: 'female.png' },
      ],
      defaultValue: 'male',
    });

    expect(normalized?.options).toEqual([
      expect.objectContaining({ label: 'Male', value: 'male' }),
      expect.objectContaining({ label: 'Female', value: 'female' }),
    ]);
  });

  it('keeps optional icons on multi_slider fields', () => {
    const normalized = normalizeOnboardingUiConfig({
      kind: 'multi_slider',
      fields: [
        {
          label: 'Height',
          unit: 'CM',
          min: 0,
          max: 500,
          step: 1,
          default: 180,
          icon: '/onboarding/icons/height.png',
        },
      ],
    });

    expect(normalized?.fields).toEqual([
      expect.objectContaining({
        key: 'height_cm',
        icon: '/onboarding/icons/height.png',
      }),
    ]);
  });

  it('preserves explicit keys and values when provided', () => {
    const normalized = normalizeOnboardingUiConfig({
      kind: 'multi_slider',
      fields: [
        {
          key: 'heightCm',
          label: 'Height',
          unit: 'CM',
          min: 0,
          max: 500,
          step: 1,
          default: 180,
        },
      ],
    });

    expect(normalized?.fields).toEqual([
      expect.objectContaining({ key: 'heightCm' }),
    ]);
  });
});

describe('prepareOnboardingUiConfig', () => {
  it('stores multi_slider field icons as strings, including uploaded-icon objects', () => {
    const prepared = prepareOnboardingUiConfig({
      kind: 'multi_slider',
      fields: [
        {
          label: 'Height',
          unit: 'CM',
          min: 0,
          max: 500,
          step: 1,
          default: 180,
          icon: {
            id: '11111111-1111-4111-8111-111111111111',
            iconUrl: '/onboarding/icons/height.png',
            filename: 'height.png',
          },
        },
      ],
    });

    expect(prepared?.fields).toEqual([
      expect.objectContaining({
        key: 'height_cm',
        icon: '/onboarding/icons/height.png',
      }),
    ]);
  });
});
