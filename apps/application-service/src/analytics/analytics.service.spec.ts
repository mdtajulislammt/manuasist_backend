import { Test, TestingModule } from '@nestjs/testing';
import { AiIngestionAnalyticsClientService } from './ai-ingestion-analytics-client.service';
import { AnalyticsService } from './analytics.service';

jest.mock('../membership/membership.service', () => ({
  MembershipService: class MembershipService {},
}));

jest.mock('../meals/meals.service', () => ({
  MealsService: class MealsService {},
}));

jest.mock('../users-me/dietary-preferences.resolver', () => ({
  DietaryPreferencesResolver: class DietaryPreferencesResolver {},
}));

import { MembershipService } from '../membership/membership.service';
import { MealsService } from '../meals/meals.service';
import { DietaryPreferencesResolver } from '../users-me/dietary-preferences.resolver';

describe('AnalyticsService', () => {
  let service: AnalyticsService;
  let membership: { assertPremiumAccess: jest.Mock };
  let meals: { getMealsInRange: jest.Mock };
  let dietary: { resolve: jest.Mock };
  let ingestion: {
    getCompletedScans: jest.Mock;
    getDishesBatch: jest.Mock;
  };

  beforeEach(async () => {
    membership = { assertPremiumAccess: jest.fn().mockResolvedValue(undefined) };
    meals = { getMealsInRange: jest.fn().mockResolvedValue([]) };
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

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AnalyticsService,
        { provide: MembershipService, useValue: membership },
        { provide: MealsService, useValue: meals },
        { provide: DietaryPreferencesResolver, useValue: dietary },
        { provide: AiIngestionAnalyticsClientService, useValue: ingestion },
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
    expect(result.data.mealSuggestions).toHaveLength(4);
    expect(membership.assertPremiumAccess).toHaveBeenCalledWith('user-1');
  });

  it('returns six good-week buckets', async () => {
    const result = await service.getGoodWeeksVsOffWeeks('user-1');

    expect(result.data.weeks).toHaveLength(6);
    expect(result.data.threshold).toBe(80);
  });
});
