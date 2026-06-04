import {
  BadGatewayException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

export type AdminOnboardingStep = {
  id: string;
  flowId: string;
  orderIndex: number;
  type: string;
  title: string;
  subtitle: string | null;
  uiConfig: Record<string, unknown> | null;
  createdAt: string;
  updatedAt: string;
};

export type AdminActiveFlowPayload = {
  id: string;
  name: string;
  status: string;
  version: number;
  isActive: boolean;
  publishedAt: string | null;
  createdAt: string;
  updatedAt: string;
  steps: AdminOnboardingStep[];
};

export type AdminSubscriptionCatalogPrice = {
  id: string;
  planId: string;
  planKey: string;
  planDisplayName: string;
  planDescription: string | null;
  features: string[];
  version: number;
  amountMinor: number;
  currency: string;
  priceLabel: string;
  billingPeriodLabel: string;
  interval: string;
  trialDays: number | null;
  revenueCatEntitlementId: string;
  revenueCatOfferingId: string | null;
  revenueCatPackageId: string | null;
  revenueCatProductIds: string[];
  effectiveFrom: string | null;
  effectiveUntil: string | null;
  status: string;
};

export type AdminSubscriptionCatalogPayload = {
  prices: AdminSubscriptionCatalogPrice[];
};

export type AdminReferralRewardTier = {
  id: string;
  friendsRequired: number;
  rewardLabel: string;
  scanCredits: number;
  premiumDays: number;
  sortOrder: number;
};

export type AdminReferralOfferPayload = {
  id: string;
  name: string;
  status: string;
  isActive: boolean;
  shareBaseUrl: string | null;
  publishedAt: string | null;
  tiers: AdminReferralRewardTier[];
};

@Injectable()
export class AdminInternalClientService {
  constructor(private readonly config: ConfigService) { }

  async getActiveFlow(): Promise<{ success: boolean, message: string, data: AdminActiveFlowPayload }> {
    const body = await this.getInternal<AdminActiveFlowPayload>(
      '/internal/onboarding/active-flow',
      'No active onboarding flow is configured',
    );
    if (!body.data || typeof body.data.version !== 'number') {
      throw new BadGatewayException(
        'admin-service active-flow response missing data.version',
      );
    }
    const { data } = body;
    return {
      success: true,
      message: 'Active flow retrieved successfully',
      data: {
        ...data,
        steps: Array.isArray(data.steps) ? data.steps : [],
      } as AdminActiveFlowPayload
    }
  }

  async getActiveSubscriptionCatalog(): Promise<AdminSubscriptionCatalogPayload> {
    const body = await this.getInternal<AdminSubscriptionCatalogPayload>(
      '/internal/subscriptions/catalog/active',
      'No active subscription catalog is configured',
    );
    return {
      prices: Array.isArray(body.data?.prices) ? body.data.prices : [],
    };
  }

  async getSubscriptionPrice(
    id: string,
  ): Promise<AdminSubscriptionCatalogPrice | null> {
    try {
      const body = await this.getInternal<AdminSubscriptionCatalogPrice>(
        `/internal/subscriptions/prices/${id}`,
        'Subscription price is not configured',
      );
      return body.data ?? null;
    } catch (error) {
      if (error instanceof NotFoundException) {
        return null;
      }
      throw error;
    }
  }

  async getActiveReferralOffer(): Promise<AdminReferralOfferPayload | null> {
    try {
      const body = await this.getInternal<AdminReferralOfferPayload>(
        '/internal/referrals/active-offer',
        'No active referral offer is configured',
      );
      if (!body.data) {
        return null;
      }
      return {
        ...body.data,
        tiers: Array.isArray(body.data.tiers) ? body.data.tiers : [],
      };
    } catch (error) {
      if (error instanceof NotFoundException) {
        return null;
      }
      throw error;
    }
  }

  private async getInternal<T>(
    path: string,
    notFoundMessage: string,
  ): Promise<{ success?: boolean; message?: string; data?: T }> {
    const base = this.config
      .getOrThrow<string>('ADMIN_SERVICE_URL')
      .replace(/\/$/, '');
    const key = this.config.getOrThrow<string>('ADMIN_INTERNAL_API_KEY');
    let res: Response;
    try {
      res = await fetch(`${base}${path}`, {
        headers: { 'x-internal-api-key': key },
      });
    } catch (e) {
      throw new BadGatewayException(
        `Could not reach admin-service: ${String(e)}`,
      );
    }

    if (res.status === 404) {
      throw new NotFoundException(notFoundMessage);
    }
    if (!res.ok) {
      const text = await res.text();
      throw new BadGatewayException(
        `admin-service returned ${res.status}: ${text.slice(0, 500)}`,
      );
    }
    return res.json() as Promise<{
      success?: boolean;
      message?: string;
      data?: T;
    }>;
  }
}
