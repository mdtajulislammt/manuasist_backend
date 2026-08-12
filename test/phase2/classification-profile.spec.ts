import { describe, expect, it, jest } from '@jest/globals';
import {
  classifyDish,
  classifyDishHeuristic,
  type DishNutritionHints,
} from '../../libs/ai-pipeline/src/classification';

const nutrition: DishNutritionHints = {
  calories: 420,
  proteinG: 30,
  carbG: 35,
  fatG: 14,
  source: 'test',
  confidence: 0.9,
};

describe('profile-aware dish classification', () => {
  it('treats a favorite cuisine as positive evidence, never an allergen', () => {
    const result = classifyDishHeuristic(
      { name: 'Margherita Pizza', description: 'Tomato and basil' },
      { cuisinePreferences: ['Italian'] },
      nutrition,
    );

    expect(result.category).toBe('RECOMMENDED');
    expect(result.reasons).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          code: 'CUISINE',
          severity: 'info',
        }),
      ]),
    );
    expect(result.allergenFlags).toBeUndefined();
  });

  it('avoids a dish only when its text matches a saved allergy', () => {
    const result = classifyDishHeuristic(
      { name: 'Peanut Noodles', description: 'Topped with crushed peanuts' },
      { allergies: ['Peanuts'], cuisinePreferences: ['Thai'] },
      nutrition,
    );

    expect(result.category).toBe('AVOID');
    expect(result.reasons).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          code: 'ALLERGEN',
          severity: 'critical',
          message: expect.stringContaining('Peanuts'),
        }),
      ]),
    );
  });

  it('uses nutrition evidence for saved macro targets', () => {
    const result = classifyDishHeuristic(
      { name: 'Chicken Rice Bowl' },
      { nutritionTargets: { protein: 'high', carbohydrates: 'low' } },
      { ...nutrition, carbG: 70 },
    );

    expect(result.category).toBe('CAUTION');
    expect(result.reasons).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          code: 'NUTRITION_TARGET',
          severity: 'info',
          message: expect.stringContaining('30 g protein'),
        }),
        expect.objectContaining({
          code: 'NUTRITION_TARGET',
          severity: 'warning',
          message: expect.stringContaining('70 g carbohydrates'),
        }),
      ]),
    );
  });

  it('names the exact evidence behind a diet-plan conflict', () => {
    const result = classifyDishHeuristic(
      { name: 'Creamy Chicken Pasta', description: 'Chicken and cream sauce' },
      { dietType: 'Vegan' },
      nutrition,
    );

    expect(result.category).toBe('AVOID');
    expect(result.reasons).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          code: 'DIET_ALIGN',
          severity: 'critical',
          message: expect.stringContaining('"chicken"'),
        }),
      ]),
    );
  });

  it('sends full profile and nutrition evidence to the LLM', async () => {
    const completeJson = jest.fn().mockResolvedValue({
      category: 'RECOMMENDED',
      dietScore: 88,
      reasons: [
        {
          code: 'CUISINE',
          severity: 'info',
          message: 'Matches Italian preference',
        },
      ],
    });
    const llm = {
      isConfigured: () => true,
      completeJson,
    };

    await classifyDish(
      { name: 'Vegetable Risotto' },
      {
        cuisinePreferences: ['Italian'],
        intolerances: ['Lactose'],
        healthObjectives: ['Weight Loss'],
        nutritionTargets: { fat: 'low' },
      },
      nutrition,
      llm as never,
    );

    const messages = completeJson.mock.calls[0]?.[0] as Array<{
      content: string;
    }>;
    const userMessage = messages[1]?.content ?? '';
    expect(userMessage).toContain('"cuisinePreferences":["Italian"]');
    expect(userMessage).toContain('"intolerances":["Lactose"]');
    expect(userMessage).toContain('"proteinG":30');
  });
});
