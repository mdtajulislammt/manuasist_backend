import {
  buildNaiScoreBreakdown,
  healthierThanPercent,
  scoreRating,
} from './nai-score-breakdown.util';

describe('nai-score-breakdown.util', () => {
  it('maps overall score to healthier-than percentile', () => {
    expect(healthierThanPercent(88)).toBe(72);
    expect(scoreRating(88)).toBe('Good');
    expect(scoreRating(95)).toBe('Excellent');
  });

  it('builds seven factor rows from meal data', () => {
    const today = new Date();
    const mealDate = new Date(
      Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), today.getUTCDate()),
    );
    const breakdown = buildNaiScoreBreakdown({
      meals: [
        {
          mealDate,
          mealSlot: 'LUNCH',
          calories: 500,
          proteinG: 30,
          carbG: 40,
          fatG: 15,
          naiScore: 88,
          loggedAt: mealDate,
          dishId: 'dish-1',
        },
      ],
      scans: [],
      dishes: [
        {
          id: 'dish-1',
          name: 'Salad',
          calories: 500,
          proteinG: 30,
          carbG: 40,
          fatG: 15,
          category: 'RECOMMENDED',
        },
      ],
      dailyMap: new Map([
        [
          mealDate.toISOString().slice(0, 10),
          {
            date: mealDate.toISOString().slice(0, 10),
            calories: 500,
            naiScore: 88,
            proteinG: 30,
            carbG: 40,
            fatG: 15,
            dataSource: 'meals',
          },
        ],
      ]),
      calorieTarget: 2000,
      hasAllergies: false,
    });

    expect(breakdown).toHaveLength(7);
    expect(breakdown.map((row) => row.code)).toEqual([
      'DC',
      'CB',
      'MB',
      'AS',
      'MT',
      'FQ',
      'ME',
    ]);
    expect(breakdown[0]?.score).toBe(88);
    expect(breakdown[3]?.score).toBe(100);
  });
});
