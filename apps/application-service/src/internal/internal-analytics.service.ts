import { Injectable } from '@nestjs/common';
import { EntitlementStatus, Prisma } from '../../generated/prisma/client';
import { PrismaService } from '../prisma.service';

export type AdminRevenuePeriod = 'this_month' | 'last_month' | 'year';
export type SubscriptionListStatusFilter = 'all' | 'active' | 'cancel' | 'expired';

const MONTH_LABELS = [
  'Jan',
  'Feb',
  'Mar',
  'Apr',
  'May',
  'Jun',
  'Jul',
  'Aug',
  'Sep',
  'Oct',
  'Nov',
  'Dec',
] as const;

const MAX_SUBSCRIPTION_PAGE_SIZE = 100;

@Injectable()
export class InternalAnalyticsService {
  constructor(private readonly prisma: PrismaService) {}

  async listSubscriptions(input: {
    page?: number;
    limit?: number;
    status?: SubscriptionListStatusFilter;
    userIds?: string[];
  }) {
    const page = Math.max(input.page ?? 1, 1);
    const limit = Math.min(Math.max(input.limit ?? 20, 1), MAX_SUBSCRIPTION_PAGE_SIZE);
    const skip = (page - 1) * limit;
    const where = this.buildSubscriptionWhere(input.status, input.userIds);

    const [rows, total] = await Promise.all([
      this.prisma.userEntitlement.findMany({
        where,
        skip,
        take: limit,
        orderBy: { latestEventAt: 'desc' },
        select: {
          id: true,
          userId: true,
          status: true,
          planKey: true,
          priceLabel: true,
          billingPeriodLabel: true,
          amountMinor: true,
          currency: true,
          createdAt: true,
          expiresAt: true,
          latestEventAt: true,
          willRenew: true,
        },
      }),
      this.prisma.userEntitlement.count({ where }),
    ]);

    return {
      items: rows.map((row) => this.mapSubscriptionRow(row)),
      pagination: {
        total,
        page,
        limit,
        totalPages: Math.max(Math.ceil(total / limit), 1),
      },
    };
  }

  async getSubscriptionStats() {
    const activeStatuses = [EntitlementStatus.ACTIVE, EntitlementStatus.TRIALING];

    const [totalActiveSubscriptions, totalTrialPlans, activeRevenue, totalRevenue] =
      await Promise.all([
        this.prisma.userEntitlement.count({
          where: { status: { in: activeStatuses } },
        }),
        this.prisma.userEntitlement.count({
          where: { status: EntitlementStatus.TRIALING },
        }),
        this.prisma.userEntitlement.aggregate({
          where: {
            status: { in: activeStatuses },
            amountMinor: { not: null },
          },
          _sum: { amountMinor: true },
        }),
        this.prisma.userEntitlement.aggregate({
          where: { amountMinor: { not: null } },
          _sum: { amountMinor: true },
        }),
      ]);

    const totalEarnMinor = activeRevenue._sum.amountMinor ?? 0;
    const lifetimeEarnMinor = totalRevenue._sum.amountMinor ?? 0;

    return {
      totalActiveSubscriptions,
      totalTrialPlans,
      totalEarnMinor,
      totalEarn: totalEarnMinor / 100,
      lifetimeEarnMinor,
      lifetimeEarn: lifetimeEarnMinor / 100,
      currency: 'USD',
    };
  }

  async getDashboardStats(input: {
    revenuePeriod?: AdminRevenuePeriod;
    subscriptionPage?: number;
    subscriptionLimit?: number;
  }) {
    const revenuePeriod = input.revenuePeriod ?? 'year';
    const page = input.subscriptionPage ?? 1;
    const limit = input.subscriptionLimit ?? 10;

    const now = new Date();
    const year = now.getUTCFullYear();

    const entitlements = await this.prisma.userEntitlement.findMany({
      where: { amountMinor: { not: null } },
      select: {
        amountMinor: true,
        createdAt: true,
        currency: true,
      },
    });

    const monthlyTotals = Array.from({ length: 12 }, (_, month) => {
      const start = new Date(Date.UTC(year, month, 1));
      const end = new Date(Date.UTC(year, month + 1, 1));
      const amountMinor = entitlements
        .filter(
          (row) => row.createdAt >= start && row.createdAt < end,
        )
        .reduce((sum, row) => sum + (row.amountMinor ?? 0), 0);
      return {
        label: MONTH_LABELS[month],
        month: month + 1,
        year,
        amountMinor,
        amount: amountMinor / 100,
      };
    });

    const thisMonthStart = new Date(Date.UTC(year, now.getUTCMonth(), 1));
    const nextMonthStart = new Date(Date.UTC(year, now.getUTCMonth() + 1, 1));
    const lastMonthStart = new Date(Date.UTC(year, now.getUTCMonth() - 1, 1));

    const thisMonthRevenue = sumInRange(
      entitlements,
      thisMonthStart,
      nextMonthStart,
    );
    const lastMonthRevenue = sumInRange(
      entitlements,
      lastMonthStart,
      thisMonthStart,
    );
    const growthPercent =
      lastMonthRevenue > 0
        ? Math.round(
            ((thisMonthRevenue - lastMonthRevenue) / lastMonthRevenue) * 100,
          )
        : thisMonthRevenue > 0
          ? 100
          : 0;

    const totalRevenueMinor = entitlements.reduce(
      (sum, row) => sum + (row.amountMinor ?? 0),
      0,
    );
    const activeRevenueMinor = await this.prisma.userEntitlement.aggregate({
      where: {
        status: { in: [EntitlementStatus.ACTIVE, EntitlementStatus.TRIALING] },
        amountMinor: { not: null },
      },
      _sum: { amountMinor: true },
    });

    const subscriptionList = await this.listSubscriptions({
      page,
      limit,
    });

    return {
      revenue: {
        selectedPeriod: revenuePeriod,
        totalRevenueMinor,
        totalRevenue: totalRevenueMinor / 100,
        activeRevenueMinor: activeRevenueMinor._sum.amountMinor ?? 0,
        activeRevenue: (activeRevenueMinor._sum.amountMinor ?? 0) / 100,
        growthPercent,
        growthLabel:
          growthPercent >= 0
            ? `+${growthPercent}% vs last month`
            : `${growthPercent}% vs last month`,
        chartPoints: monthlyTotals,
        periodTotalMinor:
          revenuePeriod === 'this_month'
            ? thisMonthRevenue
            : revenuePeriod === 'last_month'
              ? lastMonthRevenue
              : totalRevenueMinor,
      },
      subscriptions: subscriptionList,
    };
  }

  private buildSubscriptionWhere(
    status: SubscriptionListStatusFilter | undefined,
    userIds: string[] | undefined,
  ): Prisma.UserEntitlementWhereInput {
    const where: Prisma.UserEntitlementWhereInput = {};
    const filter = status ?? 'all';

    if (filter === 'active') {
      where.status = { in: [EntitlementStatus.ACTIVE, EntitlementStatus.TRIALING] };
    } else if (filter === 'cancel') {
      where.status = EntitlementStatus.CANCELED;
    } else if (filter === 'expired') {
      where.status = EntitlementStatus.EXPIRED;
    }

    if (userIds?.length) {
      where.userId = { in: userIds };
    }

    return where;
  }

  private mapSubscriptionRow(row: {
    id: string;
    userId: string;
    status: EntitlementStatus;
    planKey: string | null;
    priceLabel: string | null;
    billingPeriodLabel: string | null;
    amountMinor: number | null;
    currency: string | null;
    createdAt: Date;
    expiresAt: Date | null;
    willRenew: boolean;
  }) {
    return {
      id: row.id,
      userId: row.userId,
      subscriptionLabel:
        row.billingPeriodLabel ??
        row.priceLabel ??
        row.planKey ??
        'Subscription',
      planKey: row.planKey,
      priceLabel: row.priceLabel,
      billingPeriodLabel: row.billingPeriodLabel,
      amountMinor: row.amountMinor,
      amount: row.amountMinor === null ? null : row.amountMinor / 100,
      currency: row.currency ?? 'USD',
      subscribedAt: row.createdAt.toISOString(),
      renewDate: row.expiresAt?.toISOString() ?? null,
      status: mapSubscriptionStatus(row.status),
      rawStatus: row.status,
      willRenew: row.willRenew,
    };
  }
}

function sumInRange(
  rows: Array<{ amountMinor: number | null; createdAt: Date }>,
  start: Date,
  end: Date,
): number {
  return rows
    .filter((row) => row.createdAt >= start && row.createdAt < end)
    .reduce((sum, row) => sum + (row.amountMinor ?? 0), 0);
}

function mapSubscriptionStatus(
  status: EntitlementStatus,
): 'Active' | 'Cancel' | 'Expired' {
  if (status === EntitlementStatus.ACTIVE || status === EntitlementStatus.TRIALING) {
    return 'Active';
  }
  if (status === EntitlementStatus.CANCELED) {
    return 'Cancel';
  }
  return 'Expired';
}
