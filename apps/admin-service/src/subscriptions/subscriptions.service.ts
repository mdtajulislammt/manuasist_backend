import {
  BadRequestException,
  HttpException,
  Injectable,
  InternalServerErrorException,
  NotFoundException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  Prisma,
  RevenueCatSyncStatus,
  SubscriptionBillingInterval,
  SubscriptionPlanStatus,
  SubscriptionPriceStatus,
} from '../../generated/prisma/client';
import { PrismaService } from '../prisma.service';
import { CreateSubscriptionPlanDto } from './dto/create-subscription-plan.dto';
import { CreateSubscriptionPriceDto } from './dto/create-subscription-price.dto';
import { UpdateSubscriptionPlanDto } from './dto/update-subscription-plan.dto';
import { UpdateSubscriptionPriceDto } from './dto/update-subscription-price.dto';

type SyncResult = {
  status: RevenueCatSyncStatus;
  message: string;
  responsePayload?: Prisma.InputJsonValue;
};

class RevenueCatApiError extends Error {
  constructor(
    readonly status: number,
    readonly responseText: string,
  ) {
    super(`RevenueCat returned ${status}: ${responseText.slice(0, 500)}`);
  }
}

class RevenueCatNeedsStoreSetupError extends Error {
  constructor(
    message: string,
    readonly responsePayload: Prisma.InputJsonValue,
  ) {
    super(message);
  }
}

class RevenueCatIncompatiblePackageProductError extends Error {
  constructor(readonly responsePayload: Prisma.InputJsonValue) {
    super(
      'RevenueCat package already has an incompatible product from the same app.',
    );
  }
}

@Injectable()
export class SubscriptionsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly config: ConfigService,
  ) { }

  async createPlan(dto: CreateSubscriptionPlanDto) {
    try {
      const plan = await this.prisma.subscriptionPlan.create({
        data: {
          planKey: dto.planKey,
          displayName: dto.displayName,
          description: dto.description,
          features: dto.features as Prisma.InputJsonValue,
        },
      });
      return {
        success: true,
        message: 'Subscription plan created successfully',
        data: plan,
      };
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError) {
        if (error.code === 'P2002') {
          throw new BadRequestException('Subscription plan key already exists');
        }
      }
      this.rethrow(error, 'Failed to create subscription plan');
    }
  }

  async listPlans() {
    try {
      const plans = await this.prisma.subscriptionPlan.findMany({
        orderBy: [{ status: 'asc' }, { createdAt: 'desc' }],
        include: {
          prices: {
            orderBy: { version: 'desc' },
            include: { syncLogs: { orderBy: { createdAt: 'desc' }, take: 3 } },
          },
        },
      });
      return {
        success: true,
        message: 'Subscription plans listed successfully',
        data: plans,
      };
    } catch (error) {
      if (error instanceof HttpException) {
        throw error;
      }
      throw new InternalServerErrorException('Failed to list subscription plans');
    }
  }

  async getPlan(id: string) {
    try {
      const plan = await this.prisma.subscriptionPlan.findUnique({
        where: { id },
        include: {
          prices: {
            orderBy: { version: 'desc' },
            include: { syncLogs: { orderBy: { createdAt: 'desc' }, take: 10 } },
          },
        },
      });
      if (!plan) {
        throw new NotFoundException('Subscription plan not found');
      }
      return {
        success: true,
        message: 'Subscription plan retrieved successfully',
        data: plan,
      };
    } catch (error) {
      if (error instanceof HttpException) {
        throw error;
      }
      throw new InternalServerErrorException('Failed to get subscription plan');
    }
  }

  async updatePlan(id: string, dto: UpdateSubscriptionPlanDto) {
    try {
      await this.ensurePlan(id);
      const plan = await this.prisma.subscriptionPlan.update({
        where: { id },
        data: {
          ...(dto.displayName !== undefined ? { displayName: dto.displayName } : {}),
          ...(dto.description !== undefined ? { description: dto.description } : {}),
          ...(dto.features !== undefined
            ? { features: dto.features as Prisma.InputJsonValue }
            : {}),
        },
      });
      return {
        success: true,
        message: 'Subscription plan updated successfully',
        data: plan,
      };
    } catch (error) {
      if (error instanceof HttpException) {
        throw error;
      }
      throw new InternalServerErrorException('Failed to update subscription plan');
    }
  }

  async deletePlan(id: string) {
    try {
      await this.ensurePlan(id);
      const plan = await this.prisma.subscriptionPlan.update({
        where: { id },
        data: {
          status: SubscriptionPlanStatus.ARCHIVED,
          prices: {
            updateMany: {
              where: { status: { not: SubscriptionPriceStatus.ARCHIVED } },
              data: {
                status: SubscriptionPriceStatus.ARCHIVED,
                archivedAt: new Date(),
              },
            },
          },
        },
        include: { prices: true },
      });
      return {
        success: true,
        message: 'Subscription plan archived successfully',
        data: plan,
      };
    } catch (error) {
      if (error instanceof HttpException) {
        throw error;
      }
      throw new InternalServerErrorException('Failed to archive subscription plan');
    }
  }

  async createPrice(dto: CreateSubscriptionPriceDto) {
    try {
      const plan = await this.ensurePlan(dto.planId);
      if (plan.status === SubscriptionPlanStatus.ARCHIVED) {
        throw new BadRequestException('Cannot add prices to an archived plan');
      }
      const version = dto.version ?? (await this.nextPriceVersion(dto.planId));
      const price = await this.prisma.subscriptionPrice.create({
        data: {
          planId: dto.planId,
          version,
          amountMinor: dto.amountMinor,
          currency: dto.currency.toUpperCase(),
          priceLabel: dto.priceLabel,
          billingPeriodLabel: dto.billingPeriodLabel,
          interval: dto.interval as SubscriptionBillingInterval,
          trialDays: dto.trialDays,
          revenueCatEntitlementId: dto.revenueCatEntitlementId ?? 'premium',
          revenueCatOfferingId: dto.revenueCatOfferingId,
          revenueCatPackageId: dto.revenueCatPackageId,
          revenueCatProductIds: dto.revenueCatProductIds as Prisma.InputJsonValue,
          effectiveFrom: dto.effectiveFrom ? new Date(dto.effectiveFrom) : null,
        },
      });
      return {
        success: true,
        message: 'Subscription price created successfully',
        data: price,
      };
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError) {
        if (error.code === 'P2002') {
          throw new BadRequestException('Subscription price version already exists');
        }
      }
      this.rethrow(error, 'Failed to create subscription price');
    }
  }

  async updatePrice(id: string, dto: UpdateSubscriptionPriceDto) {
    try {

      const price = await this.ensurePrice(id);
      if (price.status !== SubscriptionPriceStatus.DRAFT) {
        throw new BadRequestException('Only draft prices can be updated');
      }
      const updated = await this.prisma.subscriptionPrice.update({
        where: { id },
        data: {
          ...(dto.amountMinor !== undefined ? { amountMinor: dto.amountMinor } : {}),
          ...(dto.currency !== undefined ? { currency: dto.currency.toUpperCase() } : {}),
          ...(dto.priceLabel !== undefined ? { priceLabel: dto.priceLabel } : {}),
          ...(dto.billingPeriodLabel !== undefined
            ? { billingPeriodLabel: dto.billingPeriodLabel }
            : {}),
          ...(dto.interval !== undefined
            ? { interval: dto.interval as SubscriptionBillingInterval }
            : {}),
          ...(dto.trialDays !== undefined ? { trialDays: dto.trialDays } : {}),
          ...(dto.revenueCatEntitlementId !== undefined
            ? { revenueCatEntitlementId: dto.revenueCatEntitlementId }
            : {}),
          ...(dto.revenueCatOfferingId !== undefined
            ? { revenueCatOfferingId: dto.revenueCatOfferingId }
            : {}),
          ...(dto.revenueCatPackageId !== undefined
            ? { revenueCatPackageId: dto.revenueCatPackageId }
            : {}),
          ...(dto.revenueCatProductIds !== undefined
            ? { revenueCatProductIds: dto.revenueCatProductIds as Prisma.InputJsonValue }
            : {}),
          ...(dto.effectiveFrom !== undefined
            ? { effectiveFrom: new Date(dto.effectiveFrom) }
            : {}),
        },
      });
      return {
        success: true,
        message: 'Subscription price updated successfully',
        data: updated,
      };
    } catch (error) {
      if (error instanceof HttpException) {
        throw error;
      }
      throw new InternalServerErrorException('Failed to update subscription price');
    }
  }

  async deletePrice(id: string) {
    try {
      await this.ensurePrice(id);
      const price = await this.prisma.subscriptionPrice.update({
        where: { id },
        data: {
          status: SubscriptionPriceStatus.ARCHIVED,
          effectiveUntil: new Date(),
          archivedAt: new Date(),
        },
      });
      return {
        success: true,
        message: 'Subscription price archived successfully',
        data: price,
      };
    } catch (error) {
      if (error instanceof HttpException) {
        throw error;
      }
      throw new InternalServerErrorException('Failed to archive subscription price');
    }
  }

  async publishPrice(id: string) {
    try {
      const price = await this.ensurePrice(id);
      if (price.status !== SubscriptionPriceStatus.DRAFT) {
        throw new BadRequestException('Only draft prices can be published');
      }

      const sync = await this.syncPriceToRevenueCat(id, 'publish');
      if (
        sync.status === RevenueCatSyncStatus.NEEDS_STORE_SETUP ||
        sync.status === RevenueCatSyncStatus.FAILED
      ) {
        throw new BadRequestException(sync.message);
        // return {
        //   success: true,
        //   message: sync.message,
        //   data: {
        //     published: false,
        //     sync,
        //   },
        // };
      }

      const now = new Date();
      const published = await this.prisma.$transaction(async (tx) => {
        await tx.subscriptionPrice.updateMany({
          where: {
            planId: price.planId,
            id: { not: price.id },
            status: SubscriptionPriceStatus.PUBLISHED,
          },
          data: {
            status: SubscriptionPriceStatus.ARCHIVED,
            effectiveUntil: now,
            archivedAt: now,
          },
        });
        return tx.subscriptionPrice.update({
          where: { id },
          data: {
            status: SubscriptionPriceStatus.PUBLISHED,
            effectiveFrom: price.effectiveFrom ?? now,
            publishedAt: now,
          },
          include: { plan: true },
        });
      });

      return {
        success: true,
        message: 'Subscription price published successfully',
        data: {
          published: true,
          price: published,
          sync,
        },
      };
    } catch (error) {
      if (error instanceof HttpException) {
        throw error;
      }
      throw new InternalServerErrorException('Failed to publish subscription price');
    }
  }

  async syncRevenueCat(id: string) {
    try {
      const sync = await this.syncPriceToRevenueCat(id, 'manual-sync');
      return {
        success: true,
        message: sync.message,
        data: sync,
      };
    } catch (error) {
      if (error instanceof HttpException) {
        throw error;
      }
      throw new InternalServerErrorException('Failed to sync subscription price to RevenueCat');
    }
  }

  async getActiveCatalogForInternal() {
    const now = new Date();
    const prices = await this.prisma.subscriptionPrice.findMany({
      where: {
        status: SubscriptionPriceStatus.PUBLISHED,
        OR: [{ effectiveFrom: null }, { effectiveFrom: { lte: now } }],
        AND: [
          {
            OR: [{ effectiveUntil: null }, { effectiveUntil: { gt: now } }],
          },
        ],
        plan: { status: SubscriptionPlanStatus.ACTIVE },
      },
      include: { plan: true },
      orderBy: [{ plan: { planKey: 'asc' } }, { version: 'desc' }],
    });
    return {
      success: true,
      message: 'Active subscription catalog retrieved',
      data: {
        prices: prices.map((price) => this.catalogPrice(price)),
      },
    };
  }

  async getPriceForInternal(id: string) {
    const price = await this.prisma.subscriptionPrice.findUnique({
      where: { id },
      include: { plan: true },
    });
    if (!price) {
      throw new NotFoundException('Subscription price not found');
    }
    return {
      success: true,
      message: 'Subscription price retrieved',
      data: this.catalogPrice(price),
    };
  }

  private async syncPriceToRevenueCat(
    id: string,
    operation: string,
  ): Promise<SyncResult> {
    const price = await this.prisma.subscriptionPrice.findUnique({
      where: { id },
      include: { plan: true },
    });
    if (!price) {
      throw new NotFoundException('Subscription price not found');
    }

    const productIds = this.stringArray(price.revenueCatProductIds);
    const requestPayload = {
      planKey: price.plan.planKey,
      priceId: price.id,
      version: price.version,
      offeringId: price.revenueCatOfferingId,
      packageId: price.revenueCatPackageId,
      productIds,
    };

    if (productIds.length === 0) {
      return this.logSync(price.id, operation, RevenueCatSyncStatus.NEEDS_STORE_SETUP, {
        requestPayload,
        message:
          'Attach App Store / Google Play product ids before syncing or publishing.',
      });
    }

    const apiKey = this.config.get<string>('REVENUECAT_API_KEY');
    const projectId = this.config.get<string>('REVENUECAT_PROJECT_ID');
    if (!apiKey || !projectId) {
      return this.logSync(price.id, operation, RevenueCatSyncStatus.SKIPPED, {
        requestPayload,
        message:
          'RevenueCat API config missing; local catalog update can continue in development.',
      });
    }

    try {
      const responsePayload = await this.pushRevenueCatCatalog(price, productIds);
      return this.logSync(price.id, operation, RevenueCatSyncStatus.SUCCESS, {
        requestPayload,
        responsePayload,
        message: 'RevenueCat catalog synced successfully.',
      });
    } catch (error) {
      if (error instanceof RevenueCatNeedsStoreSetupError) {
        return this.logSync(
          price.id,
          operation,
          RevenueCatSyncStatus.NEEDS_STORE_SETUP,
          {
            requestPayload,
            responsePayload: error.responsePayload,
            message: error.message,
          },
        );
      }
      return this.logSync(price.id, operation, RevenueCatSyncStatus.FAILED, {
        requestPayload,
        responsePayload: {
          error: error instanceof Error ? error.message : String(error),
        },
        message: 'RevenueCat catalog sync failed.',
      });
    }
  }

  private async pushRevenueCatCatalog(
    price: Prisma.SubscriptionPriceGetPayload<{ include: { plan: true } }>,
    productIds: string[],
  ): Promise<Prisma.InputJsonValue> {
    const projectId = this.config.getOrThrow<string>('REVENUECAT_PROJECT_ID');
    const offeringLookupKey = price.revenueCatOfferingId ?? price.plan.planKey;
    const packageLookupKey =
      price.revenueCatPackageId ?? `${price.plan.planKey}_v${price.version}`;
    const offering = await this.upsertRevenueCatOffering(
      projectId,
      price,
      offeringLookupKey,
    );
    const offeringId = this.revenueCatResourceId(offering, offeringLookupKey);
    const packagePayload = await this.upsertRevenueCatPackage(
      projectId,
      price,
      offeringId,
      packageLookupKey,
    );
    const packageId = this.revenueCatResourceId(packagePayload, packageLookupKey);
    const resolvedProductIds = await this.resolveRevenueCatProductIds(
      projectId,
      productIds,
    );
    let activePackage = packagePayload;
    let activePackageId = packageId;
    let attachedProducts: Prisma.InputJsonValue;
    try {
      attachedProducts = await this.attachRevenueCatProductsToPackage(
        projectId,
        activePackageId,
        resolvedProductIds,
      );
    } catch (error) {
      if (!(error instanceof RevenueCatIncompatiblePackageProductError)) {
        throw error;
      }
      const fallbackLookupKey = this.versionedPackageLookupKey(
        price,
        packageLookupKey,
      );
      activePackage = await this.createRevenueCatPackage(
        projectId,
        offeringId,
        fallbackLookupKey,
        this.packageDisplayName(price),
      );
      activePackageId = this.revenueCatResourceId(
        activePackage,
        fallbackLookupKey,
      );
      attachedProducts = await this.attachRevenueCatProductsToPackage(
        projectId,
        activePackageId,
        resolvedProductIds,
      );
      await this.prisma.subscriptionPrice.update({
        where: { id: price.id },
        data: { revenueCatPackageId: activePackageId },
      });
    }
    return {
      offering,
      package: packagePayload,
      activePackage,
      requestedProductIds: productIds,
      resolvedProductIds,
      attachedProducts,
    } as Prisma.InputJsonValue;
  }

  private async upsertRevenueCatOffering(
    projectId: string,
    price: Prisma.SubscriptionPriceGetPayload<{ include: { plan: true } }>,
    lookupKey: string,
  ): Promise<Prisma.InputJsonValue> {
    if (price.revenueCatOfferingId) {
      try {
        return await this.revenueCatPost(
          `/projects/${this.pathSegment(projectId)}/offerings/${this.pathSegment(
            price.revenueCatOfferingId,
          )}`,
          { display_name: price.plan.displayName },
        );
      } catch (error) {
        if (!(error instanceof RevenueCatApiError) || error.status !== 404) {
          throw error;
        }
        const existing = await this.findRevenueCatOffering(
          projectId,
          price.revenueCatOfferingId,
        );
        if (existing) {
          return existing;
        }
      }
    }

    try {
      return await this.revenueCatPost(
        `/projects/${this.pathSegment(projectId)}/offerings`,
        {
          lookup_key: lookupKey,
          display_name: price.plan.displayName,
        },
      );
    } catch (error) {
      if (!(error instanceof RevenueCatApiError) || error.status !== 409) {
        throw error;
      }
      const existing = await this.findRevenueCatOffering(projectId, lookupKey);
      if (existing) {
        return existing;
      }
      throw error;
    }
  }

  private async upsertRevenueCatPackage(
    projectId: string,
    price: Prisma.SubscriptionPriceGetPayload<{ include: { plan: true } }>,
    offeringId: string,
    lookupKey: string,
  ): Promise<Prisma.InputJsonValue> {
    const displayName = this.packageDisplayName(price);
    if (price.revenueCatPackageId) {
      try {
        return await this.revenueCatPost(
          `/projects/${this.pathSegment(projectId)}/packages/${this.pathSegment(
            price.revenueCatPackageId,
          )}`,
          { display_name: displayName },
        );
      } catch (error) {
        if (!(error instanceof RevenueCatApiError) || error.status !== 404) {
          throw error;
        }
        const existing = await this.findRevenueCatPackage(
          projectId,
          offeringId,
          price.revenueCatPackageId,
        );
        if (existing) {
          return existing;
        }
      }
    }

    try {
      return await this.revenueCatPost(
        `/projects/${this.pathSegment(projectId)}/offerings/${this.pathSegment(
          offeringId,
        )}/packages`,
        {
          lookup_key: lookupKey,
          display_name: displayName,
        },
      );
    } catch (error) {
      if (!(error instanceof RevenueCatApiError) || error.status !== 409) {
        throw error;
      }
      const existing = await this.findRevenueCatPackage(
        projectId,
        offeringId,
        lookupKey,
      );
      if (existing) {
        return existing;
      }
      throw error;
    }
  }

  private async createRevenueCatPackage(
    projectId: string,
    offeringId: string,
    lookupKey: string,
    displayName: string,
  ): Promise<Prisma.InputJsonValue> {
    try {
      return await this.revenueCatPost(
        `/projects/${this.pathSegment(projectId)}/offerings/${this.pathSegment(
          offeringId,
        )}/packages`,
        {
          lookup_key: lookupKey,
          display_name: displayName,
        },
      );
    } catch (error) {
      if (!(error instanceof RevenueCatApiError) || error.status !== 409) {
        throw error;
      }
      const existing = await this.findRevenueCatPackage(
        projectId,
        offeringId,
        lookupKey,
      );
      if (existing) {
        return existing;
      }
      throw error;
    }
  }

  private async attachRevenueCatProductsToPackage(
    projectId: string,
    packageId: string,
    productIds: string[],
  ): Promise<Prisma.InputJsonValue> {
    try {
      return await this.revenueCatPost(
        `/projects/${this.pathSegment(projectId)}/packages/${this.pathSegment(
          packageId,
        )}/actions/attach_products`,
        {
          products: productIds.map((productId) => ({
            product_id: productId,
            eligibility_criteria: 'all',
          })),
        },
      );
    } catch (error) {
      if (error instanceof RevenueCatApiError && error.status === 409) {
        return {
          object: 'package_product_attachment',
          status: 'already_attached',
          productIds,
        };
      }
      if (
        error instanceof RevenueCatApiError &&
        error.status === 422 &&
        error.responseText.includes('incompatible product')
      ) {
        throw new RevenueCatIncompatiblePackageProductError({
          productIds,
          revenueCatError: error.message,
        });
      }
      if (
        error instanceof RevenueCatApiError &&
        error.status === 404 &&
        error.responseText.includes("product IDs don't exist")
      ) {
        throw new RevenueCatNeedsStoreSetupError(
          'Create/link these products in RevenueCat before attaching them to a package.',
          {
            productIds,
            revenueCatError: error.message,
          },
        );
      }
      throw error;
    }
  }

  private async revenueCatPost(
    path: string,
    body: Record<string, unknown>,
  ): Promise<Prisma.InputJsonValue> {
    const base =
      this.config.get<string>('REVENUECAT_API_BASE_URL') ??
      'https://api.revenuecat.com/v2';
    const apiKey = this.config.getOrThrow<string>('REVENUECAT_API_KEY');
    const res = await fetch(`${base.replace(/\/$/, '')}${path}`, {
      method: 'POST',
      headers: {
        authorization: `Bearer ${apiKey}`,
        'content-type': 'application/json',
      },
      body: JSON.stringify(body),
    });
    const text = await res.text();
    const payload = this.parseJson(text);
    if (!res.ok) {
      throw new RevenueCatApiError(res.status, text);
    }
    return payload;
  }

  private async revenueCatGet(path: string): Promise<Prisma.InputJsonValue> {
    const base =
      this.config.get<string>('REVENUECAT_API_BASE_URL') ??
      'https://api.revenuecat.com/v2';
    const apiKey = this.config.getOrThrow<string>('REVENUECAT_API_KEY');
    const res = await fetch(`${base.replace(/\/$/, '')}${path}`, {
      headers: {
        authorization: `Bearer ${apiKey}`,
      },
    });
    const text = await res.text();
    const payload = this.parseJson(text);
    if (!res.ok) {
      throw new RevenueCatApiError(res.status, text);
    }
    return payload;
  }

  private async findRevenueCatOffering(
    projectId: string,
    identifier: string,
  ): Promise<Prisma.InputJsonValue | null> {
    const payload = await this.revenueCatGet(
      `/projects/${this.pathSegment(projectId)}/offerings?limit=100`,
    );
    return this.findRevenueCatResource(payload, identifier);
  }

  private async findRevenueCatPackage(
    projectId: string,
    offeringId: string,
    identifier: string,
  ): Promise<Prisma.InputJsonValue | null> {
    const payload = await this.revenueCatGet(
      `/projects/${this.pathSegment(projectId)}/offerings/${this.pathSegment(
        offeringId,
      )}/packages?limit=100`,
    );
    return this.findRevenueCatResource(payload, identifier);
  }

  private async resolveRevenueCatProductIds(
    projectId: string,
    productIds: string[],
  ): Promise<string[]> {
    const payload = await this.revenueCatGet(
      `/projects/${this.pathSegment(projectId)}/products?limit=100`,
    );
    const products = this.revenueCatItems(payload);
    const resolved: string[] = [];
    const missing: string[] = [];

    for (const productId of productIds) {
      const product = products.find((item) =>
        this.matchesRevenueCatIdentifier(item, productId),
      );
      if (!product) {
        missing.push(productId);
        continue;
      }
      resolved.push(this.revenueCatResourceId(product, productId));
    }

    if (missing.length > 0) {
      throw new RevenueCatNeedsStoreSetupError(
        'Create/link these products in RevenueCat first, then retry sync.',
        {
          missingProductIds: missing,
          requestedProductIds: productIds,
          hint: 'You can enter either the RevenueCat product id or the store identifier after the product exists in RevenueCat.',
        },
      );
    }

    return resolved;
  }

  private packageDisplayName(
    price: Prisma.SubscriptionPriceGetPayload<{ include: { plan: true } }>,
  ): string {
    return `${price.plan.displayName} ${price.billingPeriodLabel}`;
  }

  private versionedPackageLookupKey(
    price: Prisma.SubscriptionPriceGetPayload<{ include: { plan: true } }>,
    currentLookupKey: string,
  ): string {
    const suffix = `_v${price.version}`;
    return currentLookupKey.endsWith(suffix)
      ? currentLookupKey
      : `${currentLookupKey}${suffix}`;
  }

  private findRevenueCatResource(
    payload: Prisma.InputJsonValue,
    identifier: string,
  ): Prisma.InputJsonValue | null {
    const items = this.revenueCatItems(payload);
    return (
      items.find((item) => this.matchesRevenueCatIdentifier(item, identifier)) ??
      null
    );
  }

  private revenueCatItems(payload: Prisma.InputJsonValue): Prisma.InputJsonValue[] {
    if (!payload || typeof payload !== 'object' || Array.isArray(payload)) {
      return [];
    }
    const object = payload as Record<string, unknown>;
    const items = object.items ?? object.data;
    return Array.isArray(items)
      ? items.filter((item): item is Prisma.InputJsonValue =>
        Boolean(item && typeof item === 'object'),
      )
      : [];
  }

  private matchesRevenueCatIdentifier(
    payload: Prisma.InputJsonValue,
    identifier: string,
  ): boolean {
    if (!payload || typeof payload !== 'object' || Array.isArray(payload)) {
      return false;
    }
    const object = payload as Record<string, unknown>;
    const candidates = [
      object.id,
      object.lookup_key,
      object.lookupKey,
      object.store_identifier,
      object.storeIdentifier,
      object.name,
    ];
    return candidates.some(
      (candidate) =>
        typeof candidate === 'string' &&
        candidate.toLowerCase() === identifier.toLowerCase(),
    );
  }

  private revenueCatResourceId(
    payload: Prisma.InputJsonValue,
    fallback: string,
  ): string {
    if (payload && typeof payload === 'object' && !Array.isArray(payload)) {
      const object = payload as Record<string, unknown>;
      const id = object.id;
      if (typeof id === 'string' && id.trim()) {
        return id;
      }
      const lookupKey = object.lookup_key;
      if (typeof lookupKey === 'string' && lookupKey.trim()) {
        return lookupKey;
      }
    }
    return fallback;
  }

  private pathSegment(value: string): string {
    return encodeURIComponent(value);
  }

  private async logSync(
    priceId: string,
    operation: string,
    status: RevenueCatSyncStatus,
    input: {
      requestPayload: Prisma.InputJsonValue;
      responsePayload?: Prisma.InputJsonValue;
      message: string;
    },
  ): Promise<SyncResult> {
    await this.prisma.revenueCatSyncLog.create({
      data: {
        priceId,
        operation,
        status,
        requestPayload: input.requestPayload,
        responsePayload: input.responsePayload,
        message: input.message,
      },
    });
    return {
      status,
      message: input.message,
      responsePayload: input.responsePayload,
    };
  }

  private catalogPrice(
    price: Prisma.SubscriptionPriceGetPayload<{ include: { plan: true } }>,
  ) {
    return {
      id: price.id,
      planId: price.planId,
      planKey: price.plan.planKey,
      planDisplayName: price.plan.displayName,
      planDescription: price.plan.description,
      features: Array.isArray(price.plan.features) ? price.plan.features : [],
      version: price.version,
      amountMinor: price.amountMinor,
      currency: price.currency,
      priceLabel: price.priceLabel,
      billingPeriodLabel: price.billingPeriodLabel,
      interval: price.interval,
      trialDays: price.trialDays,
      revenueCatEntitlementId: price.revenueCatEntitlementId,
      revenueCatOfferingId: price.revenueCatOfferingId,
      revenueCatPackageId: price.revenueCatPackageId,
      revenueCatProductIds: this.stringArray(price.revenueCatProductIds),
      effectiveFrom: price.effectiveFrom,
      effectiveUntil: price.effectiveUntil,
      status: price.status,
    };
  }

  private async ensurePlan(id: string) {
    const plan = await this.prisma.subscriptionPlan.findUnique({ where: { id } });
    if (!plan) {
      throw new NotFoundException('Subscription plan not found');
    }
    return plan;
  }

  private async ensurePrice(id: string) {
    const price = await this.prisma.subscriptionPrice.findUnique({
      where: { id },
    });
    if (!price) {
      throw new NotFoundException('Subscription price not found');
    }
    return price;
  }

  private async nextPriceVersion(planId: string): Promise<number> {
    const latest = await this.prisma.subscriptionPrice.findFirst({
      where: { planId },
      orderBy: { version: 'desc' },
    });
    return (latest?.version ?? 0) + 1;
  }

  private stringArray(value: Prisma.JsonValue | null): string[] {
    return Array.isArray(value)
      ? value.filter((item): item is string => typeof item === 'string')
      : [];
  }

  private parseJson(text: string): Prisma.InputJsonValue {
    if (!text) {
      return {};
    }
    try {
      return JSON.parse(text) as Prisma.InputJsonValue;
    } catch {
      return { raw: text };
    }
  }

  private rethrow(error: unknown, fallback: string): never {
    if (error instanceof HttpException) {
      throw error;
    }
    throw new InternalServerErrorException(fallback);
  }
}
