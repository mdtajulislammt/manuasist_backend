import { Test, TestingModule } from '@nestjs/testing';
import { AdminInternalClientService } from '../admin-internal/admin-internal-client.service';
import { AiIngestionDishesClientService } from './ai-ingestion-dishes-client.service';
import { AiIngestionHomeClientService } from '../home/ai-ingestion-home-client.service';
import { PrismaService } from '../prisma.service';
import { MealsService } from './meals.service';

describe('MealsService', () => {
  let service: MealsService;
  let aiDishes: { getDishForMealPrefill: jest.Mock };
  let prisma: {
    mealLogEntry: { findMany: jest.Mock; create: jest.Mock };
    preferences: { findUnique: jest.Mock };
    userOnboardingAnswer: { findMany: jest.Mock };
  };
  let aiHome: { getHomeSummary: jest.Mock };
  let admin: { getActiveFlow: jest.Mock };

  beforeEach(async () => {
    aiDishes = { getDishForMealPrefill: jest.fn() };
    prisma = {
      mealLogEntry: {
        findMany: jest.fn().mockResolvedValue([]),
        create: jest.fn(),
      },
      preferences: { findUnique: jest.fn().mockResolvedValue(null) },
      userOnboardingAnswer: { findMany: jest.fn().mockResolvedValue([]) },
    };
    aiHome = { getHomeSummary: jest.fn().mockResolvedValue({ latestScore: 72 }) };
    admin = {
      getActiveFlow: jest.fn().mockResolvedValue({
        data: { steps: [] },
      }),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        MealsService,
        {
          provide: PrismaService,
          useValue: prisma,
        },
        {
          provide: AiIngestionDishesClientService,
          useValue: aiDishes,
        },
        {
          provide: AiIngestionHomeClientService,
          useValue: aiHome,
        },
        {
          provide: AdminInternalClientService,
          useValue: admin,
        },
      ],
    }).compile();

    service = module.get<MealsService>(MealsService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  it('returns enriched prefill data including image and default NAI preview', async () => {
    aiDishes.getDishForMealPrefill.mockResolvedValue({
      dishId: 'dish-1',
      scanId: 'scan-1',
      name: 'Grilled Salmon',
      category: 'RECOMMENDED',
      tags: ['High Protein'],
      description: 'A strong match for your dietary profile.',
      imageUrl: 'https://api.example.com/v1/admin/files/menu-scan/salmon.jpg',
      baseNutrition: {
        calories: 240,
        proteinG: 28,
        carbG: 4,
        fatG: 12,
      },
      baseNaiScore: 88,
      scoreLabel: '88% match',
      dietScore: 85,
      nutritionConfidence: 0.9,
      isBookmarked: true,
    });

    const result = await service.getPrefill('user-1', 'dish-1');

    expect(result.data.dish).toMatchObject({
      dishId: 'dish-1',
      imageUrl: 'https://api.example.com/v1/admin/files/menu-scan/salmon.jpg',
      category: 'RECOMMENDED',
      baseNaiScore: 88,
      scoreLabel: '88% match',
      caloriesLabel: '240 kcal',
      isBookmarked: true,
    });
    expect(result.data.mealSlotOptions).toHaveLength(4);
    expect(result.data.defaultMealSlot).toEqual(expect.any(String));
    expect(result.data.defaultLoggedAt).toEqual(expect.any(String));
    expect(result.data.defaultNaiPreview.naiScore).toEqual(expect.any(Number));
    expect(result.data.defaultNaiPreview.naiImpact.label).toMatch(/points$/);
    expect(result.data.portionCaloriesHint).toBe(
      'Approx. 240 calories for this portion.',
    );
    expect(result.data.todayContext).toEqual({
      loggedMealCount: 0,
      currentDailyCalories: 0,
      currentDailyNai: 72,
    });
  });
});
