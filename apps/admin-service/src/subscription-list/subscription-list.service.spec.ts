import { Test, TestingModule } from '@nestjs/testing';
import { ApplicationAnalyticsClientService } from '../analytics/application-analytics-client.service';
import { AuthAnalyticsClientService } from '../analytics/auth-analytics-client.service';
import { UsersService } from '../users/users.service';
import { PrismaService } from '../prisma.service';
import { SubscriptionListService } from './subscription-list.service';

describe('SubscriptionListService', () => {
  let service: SubscriptionListService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        SubscriptionListService,
        {
          provide: ApplicationAnalyticsClientService,
          useValue: {
            getSubscriptionStats: jest.fn().mockResolvedValue({
              totalActiveSubscriptions: 12,
              totalTrialPlans: 3,
              totalEarnMinor: 3599,
              totalEarn: 35.99,
              lifetimeEarnMinor: 12500,
              lifetimeEarn: 125,
              currency: 'USD',
            }),
            listSubscriptions: jest.fn().mockResolvedValue({
              items: [
                {
                  id: 'ent-1',
                  userId: 'user-1',
                  subscriptionLabel: 'Monthly Plan',
                  planKey: 'premium_monthly',
                  priceLabel: '$2.99',
                  billingPeriodLabel: 'Per Month',
                  amountMinor: 299,
                  amount: 2.99,
                  currency: 'USD',
                  subscribedAt: '2026-06-01T00:00:00.000Z',
                  renewDate: '2026-07-01T00:00:00.000Z',
                  status: 'Active',
                  rawStatus: 'ACTIVE',
                  willRenew: true,
                },
              ],
              pagination: { total: 1, page: 1, limit: 20, totalPages: 1 },
            }),
          },
        },
        {
          provide: AuthAnalyticsClientService,
          useValue: {
            getUsersByIds: jest.fn().mockResolvedValue([
              {
                id: 'user-1',
                fullName: 'Jane Doe',
                email: 'jane@example.com',
                phone: '+1234567890',
                avatarUrl: 'https://example.com/avatar.jpg',
              },
            ]),
          },
        },
        {
          provide: UsersService,
          useValue: { getAll: jest.fn() },
        },
        {
          provide: PrismaService,
          useValue: {
            subscriptionPlan: {
              findMany: jest.fn().mockResolvedValue([
                {
                  planKey: 'premium_monthly',
                  displayName: 'Premium Monthly',
                },
              ]),
            },
          },
        },
      ],
    }).compile();

    service = module.get<SubscriptionListService>(SubscriptionListService);
  });

  it('returns subscription stats', async () => {
    const result = await service.getStats();

    expect(result.data).toEqual({
      totalActiveSubscriptions: 12,
      totalTrialPlans: 3,
      totalEarn: 35.99,
      totalEarnMinor: 3599,
      lifetimeEarn: 125,
      lifetimeEarnMinor: 12500,
      currency: 'USD',
    });
  });

  it('returns subscribers with user and plan details', async () => {
    const result = await service.list({ page: 1, limit: 20 });

    expect(result.data.items).toHaveLength(1);
    expect(result.data.items[0]).toMatchObject({
      user: {
        fullName: 'Jane Doe',
        email: 'jane@example.com',
        phone: '+1234567890',
        avatarUrl: 'https://example.com/avatar.jpg',
      },
      plan: {
        planKey: 'premium_monthly',
        displayName: 'Premium Monthly',
      },
      price: {
        label: '$2.99',
        amount: 2.99,
        currency: 'USD',
        billingPeriodLabel: 'Per Month',
      },
      status: 'Active',
      renewDate: '2026-07-01T00:00:00.000Z',
    });
  });
});
