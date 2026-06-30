import { Injectable } from '@nestjs/common';
import { EntitlementStatus } from '../../generated/prisma/client';
import { PrismaService } from '../prisma.service';

export type AdminRevenuePeriod = 'this_month' | 'last_month' | 'year';

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

@Injectable()
export class InternalAnalyticsService {
  constructor(private readonly prisma: PrismaService) {}

  async getDashboardStats(input: {
    revenuePeriod?: AdminRevenuePeriod;
    subscriptionPage?: number;
    subscriptionLimit?: number;
  }) {
    const revenuePeriod = input.revenuePeriod ?? 'year';
    const page = input.subscriptionPage ?? 1;
    const limit = input.subscriptionLimit ?? 10;
    const skip = (page - 1) * limit;

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

    const [subscriptions, subscriptionTotal] = await Promise.all([
      this.prisma.userEntitlement.findMany({
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
      this.prisma.userEntitlement.count(),
    ]);

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
      subscriptions: {
        items: subscriptions.map((row) => ({
          id: row.id,
          userId: row.userId,
          subscriptionLabel:
            row.billingPeriodLabel ??
            row.priceLabel ??
            row.planKey ??
            'Subscription',
          amountMinor: row.amountMinor,
          amount: row.amountMinor === null ? null : row.amountMinor / 100,
          currency: row.currency ?? 'USD',
          subscribedAt: row.createdAt.toISOString(),
          renewDate: row.expiresAt?.toISOString() ?? null,
          status: mapSubscriptionStatus(row.status),
          rawStatus: row.status,
          willRenew: row.willRenew,
        })),
        pagination: {
          total: subscriptionTotal,
          page,
          limit,
          totalPages: Math.ceil(subscriptionTotal / limit),
        },
      },
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
