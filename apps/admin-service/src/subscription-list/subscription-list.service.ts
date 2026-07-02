import {
  HttpException,
  Injectable,
  InternalServerErrorException,
} from '@nestjs/common';
import { ApplicationAnalyticsClientService } from '../analytics/application-analytics-client.service';
import { AuthAnalyticsClientService } from '../analytics/auth-analytics-client.service';
import { UsersService } from '../users/users.service';
import { PrismaService } from '../prisma.service';
import type { SubscriptionListQueryDto } from './dto/subscription-list-query.dto';

@Injectable()
export class SubscriptionListService {
  constructor(
    private readonly application: ApplicationAnalyticsClientService,
    private readonly auth: AuthAnalyticsClientService,
    private readonly users: UsersService,
    private readonly prisma: PrismaService,
  ) {}

  async list(query: SubscriptionListQueryDto = {}) {
    try {
      const page = query.page ?? 1;
      const limit = query.limit ?? 20;
      const status = query.status ?? 'all';
      const userIds = await this.resolveSearchUserIds(query.q);

      if (query.q && userIds.length === 0) {
        return {
          success: true,
          message: 'No subscribers matched your search',
          data: {
            items: [],
            pagination: {
              total: 0,
              page,
              limit,
              totalPages: 1,
            },
          },
        };
      }

      const subscriptions = await this.application.listSubscriptions({
        page,
        limit,
        status,
        userIds: userIds.length > 0 ? userIds : undefined,
      });

      const subscriptionUserIds = [
        ...new Set(subscriptions.items.map((row) => row.userId)),
      ];
      const [users, planMap] = await Promise.all([
        this.auth.getUsersByIds(subscriptionUserIds),
        this.loadPlanDisplayNames(
          subscriptions.items
            .map((row) => row.planKey)
            .filter((planKey): planKey is string => Boolean(planKey)),
        ),
      ]);
      const userMap = new Map(users.map((user) => [user.id, user]));

      const items = subscriptions.items.map((row) => {
        const user = userMap.get(row.userId);
        const planDisplayName =
          (row.planKey ? planMap.get(row.planKey) : null) ??
          row.subscriptionLabel;

        return {
          id: row.id,
          userId: row.userId,
          user: {
            fullName: user?.fullName ?? null,
            email: user?.email ?? null,
            phone: user?.phone ?? null,
            avatarUrl: user?.avatarUrl ?? null,
          },
          plan: {
            planKey: row.planKey,
            displayName: planDisplayName,
          },
          price: {
            label: row.priceLabel,
            amountMinor: row.amountMinor,
            amount: row.amount,
            currency: row.currency,
            billingPeriodLabel: row.billingPeriodLabel,
          },
          subscribedAt: row.subscribedAt,
          renewDate: row.renewDate,
          status: row.status,
          rawStatus: row.rawStatus,
          willRenew: row.willRenew,
        };
      });

      return {
        success: true,
        message: 'Subscription list retrieved successfully',
        data: {
          items,
          pagination: subscriptions.pagination,
        },
      };
    } catch (error) {
      if (error instanceof HttpException) {
        throw error;
      }
      throw new InternalServerErrorException('Failed to list subscriptions');
    }
  }

  private async resolveSearchUserIds(q?: string): Promise<string[]> {
    if (!q?.trim()) {
      return [];
    }

    const response = await this.users.getAll(q.trim(), 1, 100);
    const users = response?.data?.users ?? [];
    return users.map((user: { id: string }) => user.id);
  }

  private async loadPlanDisplayNames(planKeys: string[]) {
    const uniqueKeys = [...new Set(planKeys)];
    if (uniqueKeys.length === 0) {
      return new Map<string, string>();
    }

    const plans = await this.prisma.subscriptionPlan.findMany({
      where: { planKey: { in: uniqueKeys } },
      select: { planKey: true, displayName: true },
    });

    return new Map(plans.map((plan) => [plan.planKey, plan.displayName]));
  }
}
