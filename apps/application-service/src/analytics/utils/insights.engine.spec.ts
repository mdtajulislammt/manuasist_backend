import { buildCalorieInsights, buildRestaurantInsights } from './insights.engine';

describe('insights.engine', () => {
  it('flags weekend calorie spikes', () => {
    const saturday = new Date('2026-06-20T18:00:00.000Z');
    const monday = new Date('2026-06-22T12:00:00.000Z');
    const insights = buildCalorieInsights({
      calorieTarget: 2000,
      meals: [
        {
          mealDate: saturday,
          mealSlot: 'DINNER',
          calories: 2500,
          proteinG: 20,
          carbG: 30,
          fatG: 10,
          naiScore: 70,
          loggedAt: saturday,
          dishId: 'd1',
        },
        {
          mealDate: monday,
          mealSlot: 'LUNCH',
          calories: 500,
          proteinG: 20,
          carbG: 30,
          fatG: 10,
          naiScore: 80,
          loggedAt: monday,
          dishId: 'd2',
        },
      ],
    });
    expect(insights.some((row) => row.kind === 'weekend_calories')).toBe(true);
  });

  it('flags heavy restaurant category imbalance', () => {
    const insights = buildRestaurantInsights({
      heavyCategoryCount: 9,
      healthyCategoryCount: 2,
    });
    expect(insights[0]?.kind).toBe('steakhouse_pattern');
  });
});
