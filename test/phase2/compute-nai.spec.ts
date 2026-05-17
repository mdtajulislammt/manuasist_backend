import {
  computeDishNai,
  computeScanNai,
} from '../../libs/ai-pipeline/src/nai/compute-nai';

describe('compute-nai', () => {
  it('computes dish NAI in 0-100 range', () => {
    const result = computeDishNai({
      dietScore: 80,
      nutritionConfidence: 0.9,
      calories: 400,
      calorieTarget: 2000,
      weightGoal: 'LOSE',
      category: 'RECOMMENDED',
      allergenFlags: {},
      allergies: [],
    });
    expect(result.naiScore).toBeGreaterThanOrEqual(0);
    expect(result.naiScore).toBeLessThanOrEqual(100);
    expect(result.factors.preferenceAlignment).toBe(80);
  });

  it('penalizes allergen conflicts', () => {
    const withAllergen = computeDishNai({
      dietScore: 70,
      nutritionConfidence: 0.5,
      calories: 300,
      category: 'AVOID',
      allergenFlags: { peanuts: true },
      allergies: ['peanuts'],
    });
    const clean = computeDishNai({
      dietScore: 70,
      nutritionConfidence: 0.5,
      calories: 300,
      category: 'RECOMMENDED',
      allergenFlags: {},
      allergies: ['peanuts'],
    });
    expect(withAllergen.naiScore).toBeLessThan(clean.naiScore);
  });

  it('aggregates scan NAI from top dishes', () => {
    const scan = computeScanNai([90, 85, 40, 30], 3);
    expect(scan.naiScore).toBe(72);
    expect(scan.breakdown.method).toBe('top_dishes_average');
  });
});
