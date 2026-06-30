import { BadGatewayException, Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

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
  subscriptions: {
    items: Array<{
      id: string;
      userId: string;
      subscriptionLabel: string;
      amountMinor: number | null;
      amount: number | null;
      currency: string;
      subscribedAt: string;
      renewDate: string | null;
      status: string;
      rawStatus: string;
      willRenew: boolean;
    }>;
    pagination: {
      total: number;
      page: number;
      limit: number;
      totalPages: number;
    };
  };
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
