import type { AdminOnboardingStep } from '../admin-internal/admin-internal-client.service';
import { extractDietaryRestrictions } from './extract-dietary-restrictions.util';

function step(
  id: string,
  title: string,
  uiConfig: Record<string, unknown> = {},
): Pick<AdminOnboardingStep, 'id' | 'title' | 'uiConfig'> {
  return { id, title, uiConfig };
}

describe('extractDietaryRestrictions', () => {
  it('extracts only the allergy/intolerance step and excludes cuisines', () => {
    const result = extractDietaryRestrictions(
      [
        { stepKey: 'allergies', value: ['Peanuts', 'Dairy / Milk'] },
        { stepKey: 'cuisines', value: ['Italian', 'Japanese'] },
        { stepKey: 'goals', value: ['Weight Loss'] },
      ],
      [
        step(
          'allergies',
          'Do You Have any known Allergies or Food Intolerances?',
        ),
        step('cuisines', 'What Are Your Favorite Cuisines?'),
        step('goals', 'What Are Your Diet Goals?'),
      ],
    );

    expect(result).toEqual(['Peanuts', 'Dairy / Milk']);
    expect(result).not.toContain('Italian');
  });

  it('supports an explicit semantic config for dynamically named steps', () => {
    const result = extractDietaryRestrictions(
      [{ stepKey: 'medical-foods', value: ['Soy'] }],
      [
        step('medical-foods', 'Foods to watch', {
          semanticType: 'food_intolerances',
        }),
      ],
    );

    expect(result).toEqual(['Soy']);
  });

  it('supports explicit structured answers without active-flow metadata', () => {
    const result = extractDietaryRestrictions(
      [
        {
          stepKey: 'legacy',
          value: {
            allergies: ['Eggs'],
            intolerances: ['Lactose'],
          },
        },
      ],
      [],
    );

    expect(result).toEqual(['Eggs', 'Lactose']);
  });

  it('does not guess that an unknown array is an allergy', () => {
    const result = extractDietaryRestrictions(
      [{ stepKey: 'unknown', value: ['Italian'] }],
      [],
    );

    expect(result).toEqual([]);
  });
});
