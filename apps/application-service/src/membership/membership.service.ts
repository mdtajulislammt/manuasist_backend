import {
  BadRequestException,
  HttpException,
  Injectable,
  InternalServerErrorException,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { EntitlementStatus, Prisma } from '../../generated/prisma/client';
import {
  AdminInternalClientService,
  AdminSubscriptionCatalogPrice,
} from '../admin-internal/admin-internal-client.service';
import { PrismaService } from '../prisma.service';

type RevenueCatWebhookPayload = {
  event?: Record<string, unknown>;
};

type EntitlementSnapshot = {
  active: boolean;
  status: EntitlementStatus | 'FREE';
  expiresAt: Date | null;
  willRenew: boolean;
  productId: string | null;
  periodType: string | null;
  entitlementKey: string;
  planKey: string | null;
  priceId: string | null;
  priceVersion: number | null;
  priceLabel: string | null;
  billingPeriodLabel: string | null;
  currency: string | null;
  amountMinor: number | null;
  grandfatheredUntil: Date | null;
};

type EntitlementPriceData = Partial<
  Pick<
    Prisma.UserEntitlementUncheckedCreateInput,
    | 'planKey'
    | 'priceId'
    | 'priceVersion'
    | 'priceLabel'
    | 'billingPeriodLabel'
    | 'currency'
    | 'amountMinor'
    | 'grandfatheredUntil'
  >
>;

type MembershipDisplayPrice = {
  planKey: string | null;
  planDisplayName: string | null;
  priceId: string | null;
  priceVersion: number | null;
  priceLabel: string;
  billingPeriodLabel: string;
  currency: string | null;
  amountMinor: number | null;
  features: string[];
  grandfathered: boolean;
  grandfatheredUntil: Date | null;
};

const PLAN_FEATURES = [
  'Unlimited menu scans',
  'Personalized diet recommendations',
  'Daily Nutrition Assist Index (NAI)',
  'Insights & trends',
];

@Injectable()
export class MembershipService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly config: ConfigService,
    private readonly adminInternal: AdminInternalClientService,
  ) { }

  async getMembership(userId: string) {
    try {
      const entitlement = await this.getPremiumEntitlement(userId);
      const usage = await this.ensureUsageCredit(userId);
      const displayPrice = await this.resolveDisplayPrice(entitlement);
      const trialDaysRemaining =
        entitlement.status === EntitlementStatus.TRIALING && entitlement.expiresAt
          ? this.daysRemaining(entitlement.expiresAt)
          : 0;

      return {
        success: true,
        message: 'Membership retrieved successfully',
        data: {
          status: entitlement.status,
          membershipType:
            entitlement.status === EntitlementStatus.TRIALING
              ? '14-day free trial'
              : entitlement.active
                ? (displayPrice.planDisplayName ?? 'Premium membership')
                : 'Free plan',
          trialDaysRemaining,
          nextBillingAt: entitlement.expiresAt,
          priceLabel: displayPrice.priceLabel,
          billingPeriodLabel: displayPrice.billingPeriodLabel,
          currency: displayPrice.currency,
          amountMinor: displayPrice.amountMinor,
          willRenew: entitlement.willRenew,
          productId: entitlement.productId,
          periodType: entitlement.periodType,
          planKey: displayPrice.planKey,
          priceId: displayPrice.priceId,
          priceVersion: displayPrice.priceVersion,
          grandfathered: displayPrice.grandfathered,
          grandfatheredUntil: displayPrice.grandfatheredUntil,
          freeScanCredits: usage.freeScanCredits,
          premiumUntil: usage.premiumUntil,
          planIncludes:
            displayPrice.features.length > 0 ? displayPrice.features : PLAN_FEATURES,
          renewalReminder: {
            enabled: true,
            daysBeforeRenewal: 2,
          },
          manageSubscriptionUrl:
            this.config.get<string>('REVENUECAT_MANAGEMENT_URL') ?? null,
        },
      };
    } catch (error) {
      if (error instanceof HttpException) {
        throw error;
      }
      throw new InternalServerErrorException('Failed to get membership');
    }
  }

  async handleRevenueCatWebhook(
    authorization: string | undefined,
    payload: RevenueCatWebhookPayload,
  ) {
    try {
      this.assertRevenueCatAuthorized(authorization);
      const event = payload.event ?? payload;
      const eventId = this.stringValue(event, 'id', 'event_id');
      if (!eventId) {
        throw new BadRequestException('RevenueCat event id missing');
      }

      const eventType = this.stringValue(event, 'type') ?? 'UNKNOWN';
      const appUserId = this.stringValue(
        event,
        'app_user_id',
        'appUserId',
        'original_app_user_id',
      );
      if (!appUserId) {
        throw new BadRequestException('RevenueCat app user id missing');
      }

      const existing = await this.prisma.revenueCatWebhookEvent.findUnique({
        where: { id: eventId },
      });
      if (existing) {
        return {
          success: true,
          message: 'RevenueCat event already processed',
          data: { eventId },
        };
      }

      const userId = appUserId;
      const entitlementKey =
        this.stringValue(event, 'entitlement_id', 'entitlementId') ??
        this.config.get<string>('REVENUECAT_ENTITLEMENT_ID') ??
        'premium';
      const productId = this.stringValue(event, 'product_id', 'productId');
      const expiresAt = this.dateFromValue(
        this.value(event, 'expiration_at_ms', 'expires_at_ms', 'expiration_at'),
      );
      const latestEventAt =
        this.dateFromValue(
          this.value(event, 'event_timestamp_ms', 'purchased_at_ms'),
        ) ?? new Date();
      const status = this.statusFromEvent(eventType, expiresAt);
      const statusWillRenew =
        status === EntitlementStatus.ACTIVE ||
        status === EntitlementStatus.TRIALING;
      const willRenew =
        this.booleanValue(event, 'will_renew', 'willRenew') ?? statusWillRenew;
      const currentEntitlement = await this.prisma.userEntitlement.findUnique({
        where: {
          userId_entitlementKey: {
            userId,
            entitlementKey,
          },
        },
      });
      const catalogPrice = await this.findCatalogPrice(productId, entitlementKey);
      const priceData = this.buildWebhookPriceData(
        currentEntitlement,
        catalogPrice,
        expiresAt,
      );

      await this.prisma.$transaction(async (tx) => {
        await tx.revenueCatWebhookEvent.create({
          data: {
            id: eventId,
            eventType,
            userId,
            payload: payload as Prisma.InputJsonValue,
          },
        });

        await tx.userEntitlement.upsert({
          where: {
            userId_entitlementKey: {
              userId,
              entitlementKey,
            },
          },
          create: {
            userId,
            revenueCatAppUserId: appUserId,
            entitlementKey,
            status,
            productId,
            periodType: this.stringValue(event, 'period_type', 'periodType'),
            expiresAt,
            willRenew,
            latestEventAt,
            ...priceData,
          },
          update: {
            revenueCatAppUserId: appUserId,
            status,
            productId,
            periodType: this.stringValue(event, 'period_type', 'periodType'),
            expiresAt,
            willRenew,
            latestEventAt,
            ...priceData,
          },
        });
      });

      return {
        success: true,
        message: 'RevenueCat event processed',
        data: { eventId, eventType, userId, status },
      };
    } catch (error) {
      if (error instanceof HttpException) {
        throw error;
      }
      throw new InternalServerErrorException('Failed to handle RevenueCat webhook');
    }
  }

  async assertCanCreateScan(userId: string) {
    const entitlement = await this.getPremiumEntitlement(userId);
    const usage = await this.ensureUsageCredit(userId);
    if (entitlement.active || usage.freeScanCredits > 0) {
      return {
        success: true,
        message: 'Scan allowed',
        data: {
          premium: entitlement.active,
          freeScanCredits: usage.freeScanCredits,
        },
      };
    }
    throw new BadRequestException('No active membership or free scan credits');
  }

  async consumeScanCredit(userId: string) {
    const entitlement = await this.getPremiumEntitlement(userId);
    if (entitlement.active) {
      return {
        success: true,
        message: 'Premium user; no scan credit consumed',
        data: { premium: true },
      };
    }
    const updated = await this.prisma.userUsageCredit.updateMany({
      where: { userId, freeScanCredits: { gt: 0 } },
      data: { freeScanCredits: { decrement: 1 } },
    });
    if (updated.count === 0) {
      throw new BadRequestException('No free scan credits available');
    }
    const usage = await this.ensureUsageCredit(userId);
    return {
      success: true,
      message: 'Free scan credit consumed',
      data: { premium: false, freeScanCredits: usage.freeScanCredits },
    };
  }

  async assertPremiumAccess(userId: string) {
    const entitlement = await this.getPremiumEntitlement(userId);
    if (entitlement.active) {
      return { success: true, message: 'Premium access allowed' };
    }
    throw new BadRequestException('Premium membership required');
  }

  async getPremiumEntitlement(userId: string): Promise<EntitlementSnapshot> {
    const entitlementKey =
      this.config.get<string>('REVENUECAT_ENTITLEMENT_ID') ?? 'premium';
    const row = await this.prisma.userEntitlement.findUnique({
      where: { userId_entitlementKey: { userId, entitlementKey } },
    });
    const usage = await this.ensureUsageCredit(userId);
    const now = Date.now();
    const localPremiumActive =
      usage.premiumUntil !== null && usage.premiumUntil.getTime() > now;
    if (!row) {
      return {
        active: localPremiumActive,
        status: localPremiumActive ? EntitlementStatus.ACTIVE : 'FREE',
        expiresAt: usage.premiumUntil,
        willRenew: false,
        productId: null,
        periodType: null,
        entitlementKey,
        planKey: null,
        priceId: null,
        priceVersion: null,
        priceLabel: null,
        billingPeriodLabel: null,
        currency: null,
        amountMinor: null,
        grandfatheredUntil: null,
      };
    }
    const activeStatus =
      row.status === EntitlementStatus.ACTIVE ||
      row.status === EntitlementStatus.TRIALING;
    const notExpired = !row.expiresAt || row.expiresAt.getTime() > now;
    return {
      active: (activeStatus && notExpired) || localPremiumActive,
      status: row.status,
      expiresAt: row.expiresAt,
      willRenew: row.willRenew,
      productId: row.productId,
      periodType: row.periodType,
      entitlementKey: row.entitlementKey,
      planKey: row.planKey,
      priceId: row.priceId,
      priceVersion: row.priceVersion,
      priceLabel: row.priceLabel,
      billingPeriodLabel: row.billingPeriodLabel,
      currency: row.currency,
      amountMinor: row.amountMinor,
      grandfatheredUntil: row.grandfatheredUntil,
    };
  }

  async ensureUsageCredit(userId: string) {
    return this.prisma.userUsageCredit.upsert({
      where: { userId },
      create: { userId },
      update: {},
    });
  }

  private async resolveDisplayPrice(
    entitlement: EntitlementSnapshot,
  ): Promise<MembershipDisplayPrice> {
    const snapshot = this.displayFromSnapshot(entitlement);
    const activeCatalogPrice = await this.findCatalogPrice(
      entitlement.productId,
      entitlement.entitlementKey,
      entitlement.priceId,
      entitlement.planKey,
    );
    if (snapshot && activeCatalogPrice && snapshot.priceId !== activeCatalogPrice.id) {
      const grandfatheredUntil =
        entitlement.grandfatheredUntil ?? entitlement.expiresAt;
      if (grandfatheredUntil && grandfatheredUntil.getTime() > Date.now()) {
        return {
          ...snapshot,
          grandfathered: true,
          grandfatheredUntil,
        };
      }
    }
    if (activeCatalogPrice) {
      return this.displayFromCatalog(activeCatalogPrice);
    }
    return snapshot ?? this.fallbackDisplayPrice();
  }

  private async findCatalogPrice(
    productId: string | null,
    entitlementKey: string,
    priceId?: string | null,
    planKey?: string | null,
  ): Promise<AdminSubscriptionCatalogPrice | null> {
    try {
      const catalog = await this.adminInternal.getActiveSubscriptionCatalog();
      return (
        catalog.prices.find(
          (price) =>
            productId !== null &&
            price.revenueCatProductIds.includes(productId),
        ) ??
        catalog.prices.find((price) => priceId !== null && price.id === priceId) ??
        catalog.prices.find(
          (price) => planKey !== null && price.planKey === planKey,
        ) ??
        catalog.prices.find(
          (price) => price.revenueCatEntitlementId === entitlementKey,
        ) ??
        null
      );
    } catch {
      return null;
    }
  }

  private buildWebhookPriceData(
    current:
      | Prisma.UserEntitlementGetPayload<Record<string, never>>
      | null,
    catalogPrice: AdminSubscriptionCatalogPrice | null,
    expiresAt: Date | null,
  ): EntitlementPriceData {
    if (!catalogPrice) {
      return {};
    }
    if (current && this.hasSnapshot(current) && current.priceId !== catalogPrice.id) {
      const grandfatheredUntil =
        current.grandfatheredUntil ?? current.expiresAt ?? expiresAt;
      if (grandfatheredUntil && grandfatheredUntil.getTime() > Date.now()) {
        return this.priceDataFromCurrent(current, grandfatheredUntil);
      }
    }
    return this.priceDataFromCatalog(catalogPrice, null);
  }

  private priceDataFromCatalog(
    price: AdminSubscriptionCatalogPrice,
    grandfatheredUntil: Date | null,
  ): EntitlementPriceData {
    return {
      planKey: price.planKey,
      priceId: price.id,
      priceVersion: price.version,
      priceLabel: price.priceLabel,
      billingPeriodLabel: price.billingPeriodLabel,
      currency: price.currency,
      amountMinor: price.amountMinor,
      grandfatheredUntil,
    };
  }

  private priceDataFromCurrent(
    current: Prisma.UserEntitlementGetPayload<Record<string, never>>,
    grandfatheredUntil: Date,
  ): EntitlementPriceData {
    return {
      planKey: current.planKey,
      priceId: current.priceId,
      priceVersion: current.priceVersion,
      priceLabel: current.priceLabel,
      billingPeriodLabel: current.billingPeriodLabel,
      currency: current.currency,
      amountMinor: current.amountMinor,
      grandfatheredUntil,
    };
  }

  private displayFromCatalog(
    price: AdminSubscriptionCatalogPrice,
  ): MembershipDisplayPrice {
    return {
      planKey: price.planKey,
      planDisplayName: price.planDisplayName,
      priceId: price.id,
      priceVersion: price.version,
      priceLabel: price.priceLabel,
      billingPeriodLabel: price.billingPeriodLabel,
      currency: price.currency,
      amountMinor: price.amountMinor,
      features: price.features,
      grandfathered: false,
      grandfatheredUntil: null,
    };
  }

  private displayFromSnapshot(
    entitlement: EntitlementSnapshot,
  ): MembershipDisplayPrice | null {
    if (!entitlement.priceLabel && !entitlement.billingPeriodLabel) {
      return null;
    }
    return {
      planKey: entitlement.planKey,
      planDisplayName: null,
      priceId: entitlement.priceId,
      priceVersion: entitlement.priceVersion,
      priceLabel:
        entitlement.priceLabel ??
        this.config.get<string>('MEMBERSHIP_PRICE_LABEL') ??
        '$2.99',
      billingPeriodLabel:
        entitlement.billingPeriodLabel ??
        this.config.get<string>('MEMBERSHIP_BILLING_PERIOD_LABEL') ??
        'Per Month',
      currency: entitlement.currency,
      amountMinor: entitlement.amountMinor,
      features: [],
      grandfathered: false,
      grandfatheredUntil: entitlement.grandfatheredUntil,
    };
  }

  private fallbackDisplayPrice(): MembershipDisplayPrice {
    return {
      planKey: null,
      planDisplayName: null,
      priceId: null,
      priceVersion: null,
      priceLabel: this.config.get<string>('MEMBERSHIP_PRICE_LABEL') ?? '$2.99',
      billingPeriodLabel:
        this.config.get<string>('MEMBERSHIP_BILLING_PERIOD_LABEL') ??
        'Per Month',
      currency: null,
      amountMinor: null,
      features: PLAN_FEATURES,
      grandfathered: false,
      grandfatheredUntil: null,
    };
  }

  private hasSnapshot(
    current: Prisma.UserEntitlementGetPayload<Record<string, never>>,
  ): boolean {
    return Boolean(current.priceId || current.priceLabel);
  }

  private assertRevenueCatAuthorized(authorization: string | undefined) {
    const expected = this.config.get<string>('REVENUECAT_WEBHOOK_SECRET');
    if (!expected) {
      return;
    }
    const token = authorization?.startsWith('Bearer ')
      ? authorization.slice(7)
      : authorization;
    if (token !== expected) {
      throw new UnauthorizedException('Invalid RevenueCat webhook secret');
    }
  }

  private statusFromEvent(
    eventType: string,
    expiresAt: Date | null,
  ): EntitlementStatus {
    const type = eventType.toUpperCase();
    if (type.includes('CANCEL')) {
      return EntitlementStatus.CANCELED;
    }
    if (type.includes('EXPIR')) {
      return EntitlementStatus.EXPIRED;
    }
    if (type.includes('TRIAL')) {
      return EntitlementStatus.TRIALING;
    }
    if (expiresAt && expiresAt.getTime() < Date.now()) {
      return EntitlementStatus.EXPIRED;
    }
    return EntitlementStatus.ACTIVE;
  }

  private daysRemaining(date: Date): number {
    return Math.max(
      0,
      Math.ceil((date.getTime() - Date.now()) / (24 * 60 * 60 * 1000)),
    );
  }

  private value(obj: Record<string, unknown>, ...keys: string[]) {
    for (const key of keys) {
      if (obj[key] !== undefined && obj[key] !== null) {
        return obj[key];
      }
    }
    return undefined;
  }

  private stringValue(
    obj: Record<string, unknown>,
    ...keys: string[]
  ): string | null {
    const value = this.value(obj, ...keys);
    return typeof value === 'string' && value.trim() ? value.trim() : null;
  }

  private booleanValue(
    obj: Record<string, unknown>,
    ...keys: string[]
  ): boolean | null {
    const value = this.value(obj, ...keys);
    return typeof value === 'boolean' ? value : null;
  }

  private dateFromValue(value: unknown): Date | null {
    if (typeof value === 'number') {
      return new Date(value);
    }
    if (typeof value === 'string' && value.trim()) {
      const asNumber = Number(value);
      if (Number.isFinite(asNumber)) {
        return new Date(asNumber);
      }
      const asDate = new Date(value);
      return Number.isNaN(asDate.getTime()) ? null : asDate;
    }
    return null;
  }
}
