import {
  HttpException,
  Injectable,
  InternalServerErrorException,
} from '@nestjs/common';
import { ApplicationAnalyticsClientService } from './application-analytics-client.service';
import { AuthAnalyticsClientService } from './auth-analytics-client.service';
import type { AdminDashboardQueryDto } from './dto/admin-dashboard-query.dto';
import { IngestionAnalyticsClientService } from './ingestion-analytics-client.service';

@Injectable()
export class AnalyticsService {
  constructor(
    private readonly auth: AuthAnalyticsClientService,
    private readonly ingestion: IngestionAnalyticsClientService,
    private readonly application: ApplicationAnalyticsClientService,
  ) {}

  async getDashboard(query: AdminDashboardQueryDto) {
    try {
      const topUsersLimit = query.topUsersLimit ?? 10;
      const [totalUsers, ingestionStats, applicationStats] = await Promise.all([
        this.auth.getTotalUsers(),
        this.ingestion.getDashboard(topUsersLimit),
        this.application.getDashboard({
          revenuePeriod: query.revenuePeriod ?? 'year',
          subscriptionPage: query.subscriptionPage ?? 1,
          subscriptionLimit: query.subscriptionLimit ?? 10,
        }),
      ]);

      const userIds = [
        ...ingestionStats.topUsers.map((row) => row.userId),
        ...applicationStats.subscriptions.items.map((row) => row.userId),
      ];
      const users = await this.auth.getUsersByIds(userIds);
      const userMap = new Map(users.map((user) => [user.id, user]));

      const topUsers = ingestionStats.topUsers.map((row) => {
        const user = userMap.get(row.userId);
        return {
          userId: row.userId,
          fullName: user?.fullName ?? 'Unknown user',
          avatarUrl: user?.avatarUrl ?? null,
          email: user?.email ?? null,
          naiScore: row.avgNaiScore,
          menuScanCount: row.scanCount,
        };
      });

      const recentSubscriptions = applicationStats.subscriptions.items.map(
        (row) => {
          const user = userMap.get(row.userId);
          return {
            id: row.id,
            userId: row.userId,
            userName: user?.fullName ?? 'Unknown user',
            email: user?.email ?? null,
            avatarUrl: user?.avatarUrl ?? null,
            subscription: row.subscriptionLabel,
            price: row.amount,
            currency: row.currency,
            date: row.subscribedAt,
            renewDate: row.renewDate,
            status: row.status,
            rawStatus: row.rawStatus,
            willRenew: row.willRenew,
          };
        },
      );

      return {
        success: true,
        message: 'Admin dashboard analytics retrieved successfully',
        data: {
          summary: {
            totalUsers,
            totalScans: ingestionStats.totalScans,
            totalRevenue: applicationStats.revenue.activeRevenue,
            totalRevenueMinor: applicationStats.revenue.activeRevenueMinor,
            currency: 'USD',
          },
          revenue: {
            selectedPeriod: applicationStats.revenue.selectedPeriod,
            growthPercent: applicationStats.revenue.growthPercent,
            growthLabel: applicationStats.revenue.growthLabel,
            chartPoints: applicationStats.revenue.chartPoints,
            periodTotal: applicationStats.revenue.periodTotalMinor / 100,
          },
          topUsers,
          recentSubscriptions: {
            items: recentSubscriptions,
            pagination: applicationStats.subscriptions.pagination,
          },
        },
      };
    } catch (error) {
      if (error instanceof HttpException) {
        throw error;
      }
      console.error(error);
      throw new InternalServerErrorException('Failed to get dashboard analytics');
    }
  }
}
