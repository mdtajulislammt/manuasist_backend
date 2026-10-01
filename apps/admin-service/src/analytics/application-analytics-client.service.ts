import { BadGatewayException, Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

export type ApplicationSubscriptionItem = {
  id: string;
  userId: string;
  subscriptionLabel: string;
  planKey: string | null;
  priceLabel: string | null;
  billingPeriodLabel: string | null;
  amountMinor: number | null;
  amount: number | null;
  currency: string;
  subscribedAt: string;
  renewDate: string | null;
  status: string;
  rawStatus: string;
  willRenew: boolean;
};

export type ApplicationSubscriptionListPayload = {
  items: ApplicationSubscriptionItem[];
  pagination: {
    total: number;
    page: number;
    limit: number;
    totalPages: number;
  };
};

export type ApplicationSubscriptionStatsPayload = {
  totalActiveSubscriptions: number;
  totalTrialPlans: number;
  totalEarnMinor: number;
  totalEarn: number;
  lifetimeEarnMinor: number;
  lifetimeEarn: number;
  currency: string;
};

export type ApplicationDashboardPayload = {
  revenue: {
    selectedPeriod: string;
    totalRevenueMinor: number;
    totalRevenue: number;
    activeRevenueMinor: number;
    activeRevenue: number;
    growthPercent: number;
    growthLabel: string;
    chartPoints: Array<{
      label: string;
      month: number;
      year: number;
      amountMinor: number;
      amount: number;
    }>;
    periodTotalMinor: number;
  };
  subscriptions: ApplicationSubscriptionListPayload;
};

@Injectable()
export class ApplicationAnalyticsClientService {
  constructor(private readonly config: ConfigService) {}

  async getDashboard(query: {
    revenuePeriod?: string;
    subscriptionPage?: number;
    subscriptionLimit?: number;
  }): Promise<ApplicationDashboardPayload> {
    const params = new URLSearchParams();
    if (query.revenuePeriod) {
      params.set('revenuePeriod', query.revenuePeriod);
    }
    if (query.subscriptionPage !== undefined) {
      params.set('subscriptionPage', String(query.subscriptionPage));
    }
    if (query.subscriptionLimit !== undefined) {
      params.set('subscriptionLimit', String(query.subscriptionLimit));
    }
    const suffix = params.toString() ? `?${params.toString()}` : '';
    const body = await this.fetchApplication<{ data?: ApplicationDashboardPayload }>(
      `/internal/analytics/dashboard${suffix}`,
    );
    if (!body.data) {
      throw new BadGatewayException(
        'application-service dashboard response missing data',
      );
    }
    return body.data;
  }

  async listSubscriptions(query: {
    page?: number;
    limit?: number;
    status?: 'all' | 'active' | 'cancel' | 'expired';
    userIds?: string[];
  }): Promise<ApplicationSubscriptionListPayload> {
    const params = new URLSearchParams();
    if (query.page !== undefined) {
      params.set('page', String(query.page));
    }
    if (query.limit !== undefined) {
      params.set('limit', String(query.limit));
    }
    if (query.status) {
      params.set('status', query.status);
    }
    if (query.userIds?.length) {
      params.set('userIds', query.userIds.join(','));
    }
    const suffix = params.toString() ? `?${params.toString()}` : '';
    const body = await this.fetchApplication<{
      data?: ApplicationSubscriptionListPayload;
    }>(`/internal/analytics/subscriptions${suffix}`);
    if (!body.data) {
      throw new BadGatewayException(
        'application-service subscription list response missing data',
      );
    }
    return body.data;
  }

  async getSubscriptionStats(): Promise<ApplicationSubscriptionStatsPayload> {
    const body = await this.fetchApplication<{
      data?: ApplicationSubscriptionStatsPayload;
    }>('/internal/analytics/subscriptions/stats');
    if (!body.data) {
      throw new BadGatewayException(
        'application-service subscription stats response missing data',
      );
    }
    return body.data;
  }

  private async fetchApplication<T>(path: string): Promise<T> {
    const base = this.config
      .getOrThrow<string>('APPLICATION_SERVICE_URL')
      .replace(/\/$/, '');
    const key = this.config.getOrThrow<string>('APPLICATION_INTERNAL_API_KEY');
    let res: Response;
    try {
      res = await fetch(`${base}${path}`, {
        headers: { 'x-internal-api-key': key },
      });
    } catch (error) {
      throw new BadGatewayException(
        `Could not reach application-service: ${String(error)}`,
      );
    }
    if (!res.ok) {
      const text = await res.text();
      throw new BadGatewayException(
        `application-service returned ${res.status}: ${text.slice(0, 500)}`,
      );
    }
    return (await res.json()) as T;
  }
}
