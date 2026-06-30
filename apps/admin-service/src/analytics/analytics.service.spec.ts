import { Test, TestingModule } from '@nestjs/testing';
import { AnalyticsService } from './analytics.service';
import { ApplicationAnalyticsClientService } from './application-analytics-client.service';
import { AuthAnalyticsClientService } from './auth-analytics-client.service';
import { IngestionAnalyticsClientService } from './ingestion-analytics-client.service';

describe('AnalyticsService', () => {
  let service: AnalyticsService;
  let auth: { getTotalUsers: jest.Mock; getUsersByIds: jest.Mock };
  let ingestion: { getDashboard: jest.Mock };
  let application: { getDashboard: jest.Mock };

  beforeEach(async () => {
    auth = {
      getTotalUsers: jest.fn().mockResolvedValue(2845),
      getUsersByIds: jest.fn().mockResolvedValue([
        {
          id: 'user-1',
          email: 'katie63@aol.com',
          fullName: 'Kathryn Murphy',
          avatarUrl: null,
        },
      ]),
    };
    ingestion = {
      getDashboard: jest.fn().mockResolvedValue({
        totalScans: 145,
        topUsers: [
          { userId: 'user-1', scanCount: 28, avgNaiScore: 98 },
        ],
      }),
    };
    application = {
      getDashboard: jest.fn().mockResolvedValue({
        revenue: {
          selectedPeriod: 'year',
          totalRevenueMinor: 1289000,
          totalRevenue: 12890,
          activeRevenueMinor: 1289000,
          activeRevenue: 12890,
          growthPercent: 12,
          growthLabel: '+12% vs last month',
          chartPoints: [{ label: 'Jun', month: 6, year: 2026, amountMinor: 480000, amount: 4800 }],
          periodTotalMinor: 1289000,
        },
        subscriptions: {
          items: [
            {
              id: 'sub-1',
              userId: 'user-1',
              subscriptionLabel: 'Monthly Plan',
              amountMinor: 299,
              amount: 2.99,
              currency: 'USD',
              subscribedAt: '2026-06-25T00:00:00.000Z',
              renewDate: '2026-07-25T00:00:00.000Z',
              status: 'Active',
              rawStatus: 'ACTIVE',
              willRenew: true,
            },
          ],
          pagination: { total: 1, page: 1, limit: 10, totalPages: 1 },
        },
      }),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AnalyticsService,
        { provide: AuthAnalyticsClientService, useValue: auth },
        { provide: IngestionAnalyticsClientService, useValue: ingestion },
        { provide: ApplicationAnalyticsClientService, useValue: application },
      ],
    }).compile();

    service = module.get(AnalyticsService);
  });

  it('aggregates dashboard analytics', async () => {
    const result = await service.getDashboard({
      revenuePeriod: 'this_month',
      subscriptionPage: 1,
      subscriptionLimit: 10,
      topUsersLimit: 5,
    });

    expect(result.data.summary.totalUsers).toBe(2845);
    expect(result.data.summary.totalScans).toBe(145);
    expect(result.data.topUsers[0]?.naiScore).toBe(98);
    expect(result.data.recentSubscriptions.items[0]?.email).toBe('katie63@aol.com');
    expect(application.getDashboard).toHaveBeenCalledWith({
      revenuePeriod: 'this_month',
      subscriptionPage: 1,
      subscriptionLimit: 10,
    });
  });
});
