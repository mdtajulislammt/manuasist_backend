import {
  buildDailyMetricsMap,
  computeDailyNaiFromMeals,
  macroDeviationPercent,
  macroPercents,
} from './daily-metrics.util';

describe('daily-metrics.util', () => {
  it('computes calorie-weighted daily NAI from meals', () => {
    expect(
      computeDailyNaiFromMeals([
        { calories: 500, naiScore: 80 },
        { calories: 500, naiScore: 60 },
      ]),
    ).toBe(70);
  });

  it('prefers meal logs over scans for the same day', () => {
    const day = new Date('2026-06-20T12:00:00.000Z');
    const map = buildDailyMetricsMap(
      [
        {
          mealDate: day,
          mealSlot: 'LUNCH',
          calories: 600,
          proteinG: 30,
          carbG: 50,
          fatG: 20,
          naiScore: 85,
          loggedAt: day,
          dishId: 'dish-1',
        },
      ],
      [
        {
          id: 'scan-1',
          scanTime: day,
          naiScore: 60,
          dishes: [
            {
              id: 'dish-2',
              name: 'Pasta',
              calories: 900,
              proteinG: 10,
              carbG: 80,
              fatG: 20,
              category: 'CAUTION',
            },
          ],
        },
      ],
    );

    const metrics = map.get('2026-06-20');
    expect(metrics?.calories).toBe(600);
    expect(metrics?.naiScore).toBe(85);
    expect(metrics?.dataSource).toBe('meals');
  });

  it('calculates macro deviation from goal split', () => {
    const percents = macroPercents(25, 50, 20);
    expect(percents.carbPercent).toBeGreaterThan(0);
    expect(macroDeviationPercent(percents)).toBeGreaterThanOrEqual(0);
  });
});
