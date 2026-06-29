import {
  buildCalorieInsights,
  buildMacroInsights,
  buildRestaurantInsights,
} from './insights.engine';

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

  it('uses today wording for macro fat insight', () => {
    const insights = buildMacroInsights({
      scanDayCount: 1,
      highFatScanDays: 1,
      period: 'today',
    });
    expect(insights[0]?.text).toContain('Restaurant meals today');
    expect(insights[1]?.text).toContain('Tip:');
  });

  it('suggests logging when no macro data exists', () => {
    const insights = buildMacroInsights({
      scanDayCount: 0,
      highFatScanDays: 0,
      period: 'today',
      hasLoggedData: false,
    });
    expect(insights[0]?.kind).toBe('no_macro_data');
  });

  it('flags high fat from today distribution without scans', () => {
    const insights = buildMacroInsights({
      scanDayCount: 0,
      highFatScanDays: 0,
      period: 'today',
      hasLoggedData: true,
      todayDistribution: {
        carbs: { percent: 37, status: 'within_goal' },
        fat: { percent: 43, status: 'slightly_off' },
        protein: { percent: 20, status: 'within_goal' },
      },
      chartPoints: [],
    });
    expect(insights[0]?.kind).toBe('fat_slightly_off');
    expect(insights[1]?.text).toContain('Tip:');
  });

  it('returns positive insight when macros are balanced', () => {
    const insights = buildMacroInsights({
      scanDayCount: 0,
      highFatScanDays: 0,
      period: 'today',
      hasLoggedData: true,
      todayDistribution: {
        carbs: { percent: 50, status: 'within_goal' },
        fat: { percent: 30, status: 'within_goal' },
        protein: { percent: 20, status: 'within_goal' },
      },
      chartPoints: [],
    });
    expect(insights[0]?.kind).toBe('macro_balance');
    expect(insights[0]?.severity).toBe('positive');
  });
});
