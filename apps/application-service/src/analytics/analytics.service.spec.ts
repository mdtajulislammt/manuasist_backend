import { Test, TestingModule } from '@nestjs/testing';
import { AiIngestionAnalyticsClientService } from './ai-ingestion-analytics-client.service';
import { AnalyticsService } from './analytics.service';

jest.mock('../meals/meals.service', () => ({
  MealsService: class MealsService {},
}));

jest.mock('../users-me/dietary-preferences.resolver', () => ({
  DietaryPreferencesResolver: class DietaryPreferencesResolver {},
}));

jest.mock('../home/ai-ingestion-home-client.service', () => ({
  AiIngestionHomeClientService: class AiIngestionHomeClientService {},
}));

jest.mock('../prisma.service', () => ({
  PrismaService: class PrismaService {},
}));

import { MealsService } from '../meals/meals.service';
import { DietaryPreferencesResolver } from '../users-me/dietary-preferences.resolver';
import { AiIngestionHomeClientService } from '../home/ai-ingestion-home-client.service';
import { PrismaService } from '../prisma.service';

describe('AnalyticsService', () => {
  let service: AnalyticsService;
  let meals: { getMealsInRange: jest.Mock; getTodayMealStats: jest.Mock };
  let dietary: { resolve: jest.Mock };
  let ingestion: {
    getCompletedScans: jest.Mock;
    getDishesBatch: jest.Mock;
  };
  let aiHome: { getHomeSummary: jest.Mock };
  let prisma: { userOnboardingAnswer: { findMany: jest.Mock } };

  beforeEach(async () => {
    meals = {
      getMealsInRange: jest.fn().mockResolvedValue([]),
      getTodayMealStats: jest.fn().mockResolvedValue({
        mealCount: 0,
        calories: 0,
        dailyNai: null,
      }),
    };
    dietary = {
      resolve: jest.fn().mockResolvedValue({
        calorieTarget: 2000,
        calorieTargetSource: 'preferences',
        weightGoal: null,
        dietType: null,
      }),
    };
    ingestion = {
      getCompletedScans: jest.fn().mockResolvedValue([]),
      getDishesBatch: jest.fn().mockResolvedValue([]),
    };
    aiHome = {
      getHomeSummary: jest.fn().mockResolvedValue({
        trackingRange: 'weekly',
        hasCompletedScan: false,
        latestScanId: null,
        latestScore: 88,
        previousScore: 94,
        scoreChangePercent: -6,
        todayCalories: 0,
        latestCalories: 0,
        latestScannedAt: null,
        chartPoints: [
          {
            label: '07',
            date: new Date().toISOString(),
            score: 88,
            hasScan: true,
          },
        ],
        warning:
          'Your NAI dropped by 6 points this week - mainly due to inconsistent macro balance.',
      }),
    };
    prisma = {
      userOnboardingAnswer: {
        findMany: jest.fn().mockResolvedValue([]),
      },
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AnalyticsService,
        { provide: MealsService, useValue: meals },
        { provide: DietaryPreferencesResolver, useValue: dietary },
        { provide: AiIngestionAnalyticsClientService, useValue: ingestion },
        { provide: AiIngestionHomeClientService, useValue: aiHome },
        { provide: PrismaService, useValue: prisma },
      ],
    }).compile();

    service = module.get<AnalyticsService>(AnalyticsService);
  });

  it('returns restaurant habits with deferred venue details', async () => {
    ingestion.getCompletedScans.mockResolvedValue([
      {
        id: 'scan-1',
        scanTime: new Date('2026-06-20T15:00:00.000Z'),
        naiScore: 75,
        dishes: [
          {
            id: 'dish-1',
            name: 'Ribeye',
            calories: 800,
            proteinG: 40,
            carbG: 0,
            fatG: 60,
            category: 'AVOID',
          },
        ],
      },
    ]);

    const result = await service.getRestaurantHabits('user-1', { range: 'week' });

    expect(result.data.restaurantDetailsAvailable).toBe(false);
    expect(result.data.mostVisitedRestaurants).toEqual([]);
    expect(result.data.visitFrequency.length).toBeGreaterThan(0);
  });

  it('returns calories score summary from dietary resolver target', async () => {
    const result = await service.getCaloriesScore('user-1', { range: 'week' });

    expect(result.data.summary.caloriesNeeded).toBe(2000);
    expect(result.data.chartLegend).toHaveLength(4);
    expect(result.data.chartBars).toEqual([]);
    expect(result.data.mealSuggestions).toHaveLength(4);
  });

  it('returns per-slot chart bars for logged meals', async () => {
    const today = new Date();
    const mealDate = new Date(
      Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), today.getUTCDate()),
    );
    meals.getMealsInRange.mockResolvedValue([
      {
        mealDate,
        mealSlot: 'BREAKFAST',
        calories: 489,
        proteinG: 20,
        carbG: 40,
        fatG: 15,
        naiScore: 82,
        loggedAt: mealDate,
        dishId: 'dish-1',
      },
      {
        mealDate,
        mealSlot: 'DINNER',
        calories: 700,
        proteinG: 30,
        carbG: 50,
        fatG: 25,
        naiScore: 70,
        loggedAt: mealDate,
        dishId: 'dish-2',
      },
    ]);

    const result = await service.getCaloriesScore('user-1', { range: 'week' });

    expect(result.data.chartBars.length).toBeGreaterThanOrEqual(2);
    expect(result.data.chartBars[0]).toMatchObject({
      mealSlot: 'BREAKFAST',
      colorKey: 'breakfast',
      naiScore: 82,
      calories: 489,
      isToday: true,
    });
  });

  it('returns six good-week buckets', async () => {
    const result = await service.getGoodWeeksVsOffWeeks('user-1');

    expect(result.data.weeks).toHaveLength(6);
    expect(result.data.threshold).toBe(80);
  });

  it('returns today macro time buckets for range=today', async () => {
    const today = new Date();
    const mealDate = new Date(
      Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), today.getUTCDate()),
    );
    const loggedAt = new Date(mealDate);
    loggedAt.setUTCHours(11, 0, 0, 0);

    meals.getMealsInRange.mockResolvedValue([
      {
        mealDate,
        mealSlot: 'BREAKFAST',
        calories: 400,
        proteinG: 20,
        carbG: 50,
        fatG: 10,
        naiScore: 85,
        loggedAt,
        dishId: 'dish-1',
      },
    ]);

    const result = await service.getMacrosOverTime('user-1', { range: 'today' });

    expect(result.data.chartTitle).toBe("Today's Distribution vs. Goal");
    expect(result.data.insightTitle).toBe('Your Today Insight');
    expect(result.data.chartLegend).toHaveLength(3);
    expect(result.data.chartPoints).toHaveLength(5);
    expect(result.data.chartPoints.map((point) => point.label)).toEqual([
      '6am',
      '10am',
      '2pm',
      '6pm',
      '10pm',
    ]);
    const afterBreakfast = result.data.chartPoints.find(
      (point) => point.label === '2pm',
    );
    expect(afterBreakfast?.deviationPercent).not.toBeNull();
    expect(result.data.insights.length).toBeGreaterThan(0);
  });

  it('returns NAI score dashboard payload', async () => {
    const today = new Date();
    const mealDate = new Date(
      Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), today.getUTCDate()),
    );
    meals.getTodayMealStats.mockResolvedValue({
      mealCount: 1,
      calories: 500,
      dailyNai: 88,
    });
    meals.getMealsInRange.mockResolvedValue([
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
    ]);
    ingestion.getDishesBatch.mockResolvedValue([
      {
        id: 'dish-1',
        name: 'Salad',
        calories: 500,
        proteinG: 30,
        carbG: 40,
        fatG: 15,
        category: 'RECOMMENDED',
      },
    ]);

    const result = await service.getNaiScoreDashboard('user-1', {
      period: 'today',
      trackingRange: 'weekly',
    });

    expect(result.data.summary.score).toBe(88);
    expect(result.data.summary.healthierThanPercent).toBe(72);
    expect(result.data.breakdown).toHaveLength(7);
    expect(result.data.naiTracking.warning).toContain('dropped by 6 points');
    expect(result.data.caloriesPreview.dailyBars.length).toBeGreaterThan(0);
    expect(result.data.macrosPreview.chartPoints.length).toBeGreaterThan(0);
  });

  it('uses week period for summary and preview charts', async () => {
    const today = new Date();
    const mealDate = new Date(
      Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), today.getUTCDate()),
    );
    const yesterday = new Date(mealDate);
    yesterday.setUTCDate(yesterday.getUTCDate() - 1);

    meals.getTodayMealStats.mockResolvedValue({
      mealCount: 1,
      calories: 500,
      dailyNai: 95,
    });
    meals.getMealsInRange.mockResolvedValue([
      {
        mealDate,
        mealSlot: 'LUNCH',
        calories: 500,
        proteinG: 30,
        carbG: 40,
        fatG: 15,
        naiScore: 80,
        loggedAt: mealDate,
        dishId: 'dish-1',
      },
      {
        mealDate: yesterday,
        mealSlot: 'DINNER',
        calories: 600,
        proteinG: 35,
        carbG: 45,
        fatG: 20,
        naiScore: 70,
        loggedAt: yesterday,
        dishId: 'dish-2',
      },
    ]);

    const result = await service.getNaiScoreDashboard('user-1', {
      period: 'week',
      trackingRange: 'weekly',
    });

    expect(result.data.selectedPeriod).toBe('week');
    expect(result.data.summary.score).toBe(75);
    expect(result.data.caloriesPreview.dailyBars.length).toBe(7);
  });
});
