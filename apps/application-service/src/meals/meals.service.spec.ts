import { Test, TestingModule } from '@nestjs/testing';
import { AiIngestionDishesClientService } from './ai-ingestion-dishes-client.service';
import { AiIngestionHomeClientService } from '../home/ai-ingestion-home-client.service';
import { MembershipService } from '../membership/membership.service';
import { PrismaService } from '../prisma.service';
import { MealsService } from './meals.service';

describe('MealsService', () => {
  let service: MealsService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        MealsService,
        {
          provide: PrismaService,
          useValue: {
            mealLogEntry: {
              findMany: jest.fn(),
              create: jest.fn(),
            },
            preferences: { findUnique: jest.fn() },
            userOnboardingAnswer: { findMany: jest.fn() },
          },
        },
        {
          provide: MembershipService,
          useValue: { assertPremiumAccess: jest.fn() },
        },
        {
          provide: AiIngestionDishesClientService,
          useValue: { getDishForMealPrefill: jest.fn() },
        },
        {
          provide: AiIngestionHomeClientService,
          useValue: { getHomeSummary: jest.fn() },
        },
      ],
    }).compile();

    service = module.get<MealsService>(MealsService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });
});
