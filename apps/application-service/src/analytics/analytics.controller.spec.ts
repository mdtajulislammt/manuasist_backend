import { Test, TestingModule } from '@nestjs/testing';
import { AnalyticsController } from './analytics.controller';

jest.mock('./analytics.service', () => ({
  AnalyticsService: class AnalyticsService {},
}));

import { AnalyticsService } from './analytics.service';

describe('AnalyticsController', () => {
  let controller: AnalyticsController;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [AnalyticsController],
      providers: [
        {
          provide: AnalyticsService,
          useValue: {
            getGoodWeeksVsOffWeeks: jest.fn(),
            getCaloriesScore: jest.fn(),
            getMacrosOverTime: jest.fn(),
            getRestaurantHabits: jest.fn(),
            getMostConsumedCuisines: jest.fn(),
            getNaiScoreDashboard: jest.fn(),
          },
        },
      ],
    }).compile();

    controller = module.get<AnalyticsController>(AnalyticsController);
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });
});
