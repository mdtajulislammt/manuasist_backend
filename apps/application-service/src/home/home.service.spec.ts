import { Test, TestingModule } from '@nestjs/testing';
import { AiIngestionHomeClientService } from './ai-ingestion-home-client.service';
import { HomeService } from './home.service';

jest.mock('../users-me/dietary-preferences.resolver', () => ({
  DietaryPreferencesResolver: class DietaryPreferencesResolver {},
}));

jest.mock('../meals/meals.service', () => ({
  MealsService: class MealsService {},
}));

import { DietaryPreferencesResolver } from '../users-me/dietary-preferences.resolver';
import { MealsService } from '../meals/meals.service';

const baseAiSummary = {
  trackingRange: 'weekly' as const,
  hasCompletedScan: true,
  latestScanId: 'scan-1',
  latestScore: 70,
  todayScore: 70,
  previousScore: 65,
  scoreChangePercent: 8,
  todayCalories: 900,
  latestCalories: 1200,
  latestScannedAt: '2026-06-24T12:00:00.000Z',
  chartPoints: [],
  warning: null,
};

describe('HomeService', () => {
  let service: HomeService;
  let dietary: { resolve: jest.Mock };
  let aiHome: { getHomeSummary: jest.Mock };
  let meals: {
    getTodayMealStats: jest.Mock;
    getYesterdayMealStats: jest.Mock;
  };

  beforeEach(async () => {
    dietary = {
      resolve: jest.fn().mockResolvedValue({
        calorieTarget: null,
        calorieTargetSource: null,
        weightGoal: null,
        dietType: null,
      }),
    };
    aiHome = {
      getHomeSummary: jest.fn().mockResolvedValue({ ...baseAiSummary }),
    };
    meals = {
      getTodayMealStats: jest.fn().mockResolvedValue({
        meals: [],
        calories: 0,
        dailyNai: null,
        mealCount: 0,
      }),
      getYesterdayMealStats: jest.fn().mockResolvedValue({
        meals: [],
        calories: 0,
        dailyNai: null,
        mealCount: 0,
      }),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        HomeService,
        { provide: DietaryPreferencesResolver, useValue: dietary },
        { provide: AiIngestionHomeClientService, useValue: aiHome },
        { provide: MealsService, useValue: meals },
      ],
    }).compile();

    service = module.get<HomeService>(HomeService);
  });

  it('uses meal logs for calories and NAI when meals exist today', async () => {
    meals.getTodayMealStats.mockResolvedValue({
      meals: [{ calories: 500, naiScore: 82 }],
      calories: 500,
      dailyNai: 82,
      mealCount: 1,
    });
    meals.getYesterdayMealStats.mockResolvedValue({
      meals: [{ calories: 400, naiScore: 74 }],
      calories: 400,
      dailyNai: 74,
      mealCount: 1,
    });
    dietary.resolve.mockResolvedValue({
      calorieTarget: 2000,
      calorieTargetSource: 'preferences',
      weightGoal: null,
      dietType: null,
    });

    const result = await service.getHome('user-1');

    expect(result.data.todayNai.score).toBe(82);
    expect(result.data.todayNai.dailyIntake.value).toBe(500);
    expect(result.data.nutritionProgress.totalCaloriesConsumed).toBe(500);
    expect(result.data.dataSource.calories).toBe('meals');
    expect(result.data.dataSource.naiScore).toBe('meals');
    expect(result.data.naiTracking.scoreLabel).toContain('82');
    expect(result.data.todayNai.changeText).toMatch(/from yesterday/);
  });

  it('populates nutritionProgress without undefined fields', async () => {
    dietary.resolve.mockResolvedValue({
      calorieTarget: 1800,
      calorieTargetSource: 'onboarding_answer',
      weightGoal: null,
      dietType: null,
    });
    meals.getTodayMealStats.mockResolvedValue({
      meals: [{ calories: 600, naiScore: 70 }],
      calories: 600,
      dailyNai: 70,
      mealCount: 1,
    });

    const result = await service.getHome('user-1');

    expect(result.data.nutritionProgress).toEqual({
      totalCaloriesNeeded: 1800,
      totalCaloriesConsumed: 600,
      progressPercent: 33,
    });
    expect(result.data.nutritionProgress.totalCaloriesNeeded).not.toBeUndefined();
    expect(result.data.nutritionProgress.totalCaloriesConsumed).not.toBeUndefined();
  });

  it('returns null calorieTarget when dietary resolver has no target', async () => {
    const result = await service.getHome('user-1');

    expect(result.data.calorieTarget).toBeNull();
    expect(result.data.calorieTargetSource).toBeNull();
    expect(result.data.todayNai.dailyIntake.target).toBeNull();
    expect(result.data.nutritionProgress.totalCaloriesNeeded).toBeNull();
    expect(result.data.nutritionProgress.progressPercent).toBe(0);
  });

  it('uses onboarding_answer calorie target from dietary resolver', async () => {
    dietary.resolve.mockResolvedValue({
      calorieTarget: 1650,
      calorieTargetSource: 'onboarding_answer',
      weightGoal: 'LOSE',
      dietType: 'balanced',
    });

    const result = await service.getHome('user-1');

    expect(result.data.calorieTarget).toBe(1650);
    expect(result.data.calorieTargetSource).toBe('onboarding_answer');
    expect(result.data.todayNai.dailyIntake.target).toBe(1650);
  });

  it('returns null emptyTodayNai when meals exist without scans', async () => {
    meals.getTodayMealStats.mockResolvedValue({
      meals: [{ calories: 300, naiScore: 75 }],
      calories: 300,
      dailyNai: 75,
      mealCount: 1,
    });
    aiHome.getHomeSummary.mockResolvedValue({
      ...baseAiSummary,
      hasCompletedScan: false,
      latestScore: null,
      todayCalories: 0,
      latestCalories: 0,
    });

    const result = await service.getHome('user-1');

    expect(result.data.emptyTodayNai).toBeNull();
  });

  it('uses today scan for NAI only; calories stay 0 until meals are logged', async () => {
    dietary.resolve.mockResolvedValue({
      calorieTarget: 2200,
      calorieTargetSource: 'preferences',
      weightGoal: null,
      dietType: null,
    });
    aiHome.getHomeSummary.mockResolvedValue({
      ...baseAiSummary,
      todayScore: 72,
      todayCalories: 850,
      latestCalories: 1100,
    });

    const result = await service.getHome('user-1');

    expect(result.data.todayNai.score).toBe(72);
    expect(result.data.todayNai.dailyIntake.value).toBe(0);
    expect(result.data.todayNai.dailyIntake.progressPercent).toBe(0);
    expect(result.data.nutritionProgress.totalCaloriesConsumed).toBe(0);
    expect(result.data.nutritionProgress.progressPercent).toBe(0);
    expect(result.data.dataSource.calories).toBe('none');
    expect(result.data.dataSource.naiScore).toBe('scan');
    expect(result.data.todayNai.subtitle).toBe("Based on today's menu scan");
    expect(result.data.todayNai.changeText).toBe('+8% from last scan');
    expect(result.data.emptyTodayNai).toBeNull();
  });

  it('does not use yesterday scan for today when no meals logged today', async () => {
    aiHome.getHomeSummary.mockResolvedValue({
      ...baseAiSummary,
      todayScore: null,
      todayCalories: 0,
      latestScore: 70,
      latestCalories: 1100,
      scoreChangePercent: null,
    });

    const result = await service.getHome('user-1');

    expect(result.data.todayNai.score).toBeNull();
    expect(result.data.nutritionProgress.totalCaloriesConsumed).toBe(0);
    expect(result.data.dataSource.calories).toBe('none');
    expect(result.data.dataSource.naiScore).toBe('none');
    expect(result.data.naiTracking.scoreLabel).toBe('NAI Score unavailable');
    expect(result.data.emptyTodayNai).not.toBeNull();
  });
});
