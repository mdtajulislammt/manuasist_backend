import {
  BadRequestException,
  HttpException,
  Injectable,
  InternalServerErrorException,
  NotFoundException,
} from '@nestjs/common';
import { Prisma, ReferralOfferStatus } from '../../generated/prisma/client';
import { PrismaService } from '../prisma.service';
import { CreateReferralOfferDto } from './dto/create-referral-offer.dto';
import { CreateReferralTierDto } from './dto/create-referral-tier.dto';
import { UpdateReferralOfferDto } from './dto/update-referral-offer.dto';
import { UpdateReferralTierDto } from './dto/update-referral-tier.dto';

@Injectable()
export class ReferralsService {
  constructor(private readonly prisma: PrismaService) { }

  async createOffer(dto: CreateReferralOfferDto) {
    try {
      const offer = await this.prisma.referralOffer.create({
        data: {
          name: dto.name,
          shareBaseUrl: dto.shareBaseUrl,
        },
        include: this.offerInclude(),
      });
      return {
        success: true,
        message: 'Referral offer created successfully',
        data: offer,
      };
    } catch (error) {
      if (error instanceof HttpException) {
        throw error;
      }
      throw new InternalServerErrorException('Failed to create referral offer');
    }
  }

  async listOffers() {
    try {
      const offers = await this.prisma.referralOffer.findMany({
        orderBy: [{ isActive: 'desc' }, { createdAt: 'desc' }],
        include: this.offerInclude(),
      });
      return {
        success: true,
        message: 'Referral offers listed successfully',
        data: offers,
      };
    } catch (error) {
      if (error instanceof HttpException) {
        throw error;
      }
      throw new InternalServerErrorException('Failed to list referral offers');
    }
  }

  async getOffer(id: string) {
    try {
      const offer = await this.prisma.referralOffer.findUnique({
        where: { id },
        include: this.offerInclude(),
      });
      if (!offer) {
        throw new NotFoundException('Referral offer not found');
      }
      return {
        success: true,
        message: 'Referral offer retrieved successfully',
        data: offer,
      };
    } catch (error) {
      if (error instanceof HttpException) {
        throw error;
      }
      throw new InternalServerErrorException('Failed to get referral offer');
    }
  }

  async updateOffer(id: string, dto: UpdateReferralOfferDto) {
    try {
      await this.ensureDraftOffer(id);
      const offer = await this.prisma.referralOffer.update({
        where: { id },
        data: {
          ...(dto.name !== undefined ? { name: dto.name } : {}),
          ...(dto.shareBaseUrl !== undefined ? { shareBaseUrl: dto.shareBaseUrl } : {}),
        },
        include: this.offerInclude(),
      });
      return {
        success: true,
        message: 'Referral offer updated successfully',
        data: offer,
      };
    } catch (error) {
      if (error instanceof HttpException) {
        throw error;
      }
      throw new InternalServerErrorException('Failed to update referral offer');
    }
  }

  async deleteOffer(id: string) {
    try {
      const offer = await this.ensureOffer(id);
      if (offer.status === ReferralOfferStatus.PUBLISHED && offer.isActive) {
        throw new BadRequestException('Active referral offers cannot be deleted');
      }
      const archived = await this.prisma.referralOffer.update({
        where: { id },
        data: {
          status: ReferralOfferStatus.ARCHIVED,
          isActive: false,
          archivedAt: new Date(),
        },
        include: this.offerInclude(),
      });
      return {
        success: true,
        message: 'Referral offer archived successfully',
        data: archived,
      };
    } catch (error) {
      if (error instanceof HttpException) {
        throw error;
      }
      throw new InternalServerErrorException('Failed to delete referral offer');
    }
  }

  async addTier(offerId: string, dto: CreateReferralTierDto) {
    await this.ensureDraftOffer(offerId);
    try {
      const tier = await this.prisma.referralRewardTier.create({
        data: {
          offerId,
          friendsRequired: dto.friendsRequired,
          rewardLabel: dto.rewardLabel,
          scanCredits: dto.scanCredits ?? 0,
          premiumDays: dto.premiumDays ?? 0,
          sortOrder: dto.sortOrder,
        },
      });
      return {
        success: true,
        message: 'Referral reward tier created successfully',
        data: tier,
      };
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError) {
        if (error.code === 'P2002') {
          throw new BadRequestException(
            'Tier friendsRequired or sortOrder already exists for this offer',
          );
        }
      }
      this.rethrow(error, 'Failed to create referral reward tier');
    }
  }

  async updateTier(id: string, dto: UpdateReferralTierDto) {
    const tier = await this.ensureTier(id);
    await this.ensureDraftOffer(tier.offerId);
    try {
      const updated = await this.prisma.referralRewardTier.update({
        where: { id },
        data: {
          ...(dto.friendsRequired !== undefined
            ? { friendsRequired: dto.friendsRequired }
            : {}),
          ...(dto.rewardLabel !== undefined ? { rewardLabel: dto.rewardLabel } : {}),
          ...(dto.scanCredits !== undefined ? { scanCredits: dto.scanCredits } : {}),
          ...(dto.premiumDays !== undefined ? { premiumDays: dto.premiumDays } : {}),
          ...(dto.sortOrder !== undefined ? { sortOrder: dto.sortOrder } : {}),
        },
      });
      return {
        success: true,
        message: 'Referral reward tier updated successfully',
        data: updated,
      };
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError) {
        if (error.code === 'P2002') {
          throw new BadRequestException(
            'Tier friendsRequired or sortOrder already exists for this offer',
          );
        }
      }
      this.rethrow(error, 'Failed to update referral reward tier');
    }
  }

  async deleteTier(id: string) {
    const tier = await this.ensureTier(id);
    await this.ensureDraftOffer(tier.offerId);
    await this.prisma.referralRewardTier.delete({ where: { id } });
    return {
      success: true,
      message: 'Referral reward tier deleted successfully',
      data: { deleted: true },
    };
  }

  async publishOffer(id: string) {
    const offer = await this.ensureDraftOffer(id);
    const tiers = await this.prisma.referralRewardTier.findMany({
      where: { offerId: offer.id },
      orderBy: [{ sortOrder: 'asc' }, { friendsRequired: 'asc' }],
    });
    if (tiers.length === 0) {
      throw new BadRequestException(
        'At least one reward tier is required before publishing',
      );
    }
    if (
      tiers.some(
        (tier, index) =>
          (index > 0 &&
            tier.friendsRequired <= tiers[index - 1].friendsRequired) ||
          (tier.scanCredits === 0 && tier.premiumDays === 0),
      )
    ) {
      throw new BadRequestException(
        'Reward tiers must use increasing friend thresholds and grant scan credits or premium days',
      );
    }
    const now = new Date();
    const published = await this.prisma.$transaction(async (tx) => {
      await tx.referralOffer.updateMany({
        where: {
          id: { not: id },
          status: ReferralOfferStatus.PUBLISHED,
          isActive: true,
        },
        data: {
          isActive: false,
          status: ReferralOfferStatus.ARCHIVED,
          archivedAt: now,
        },
      });
      return tx.referralOffer.update({
        where: { id },
        data: {
          status: ReferralOfferStatus.PUBLISHED,
          isActive: true,
          publishedAt: now,
          archivedAt: null,
        },
        include: this.offerInclude(),
      });
    });
    return {
      success: true,
      message: 'Referral offer published successfully',
      data: published,
    };
  }

  async getActiveOfferForInternal() {
    const offer = await this.prisma.referralOffer.findFirst({
      where: {
        status: ReferralOfferStatus.PUBLISHED,
        isActive: true,
      },
      orderBy: { publishedAt: 'desc' },
      include: this.offerInclude(),
    });
    if (!offer) {
      throw new NotFoundException('No active referral offer is configured');
    }
    return {
      success: true,
      message: 'Active referral offer retrieved',
      data: {
        id: offer.id,
        name: offer.name,
        status: offer.status,
        isActive: offer.isActive,
        shareBaseUrl: offer.shareBaseUrl,
        publishedAt: offer.publishedAt,
        tiers: offer.tiers.map((tier) => ({
          id: tier.id,
          friendsRequired: tier.friendsRequired,
          rewardLabel: tier.rewardLabel,
          scanCredits: tier.scanCredits,
          premiumDays: tier.premiumDays,
          sortOrder: tier.sortOrder,
        })),
      },
    };
  }

  private offerInclude() {
    return {
      tiers: {
        orderBy: [{ sortOrder: 'asc' }, { friendsRequired: 'asc' }],
      },
    } satisfies Prisma.ReferralOfferInclude;
  }

  private async ensureOffer(id: string) {
    const offer = await this.prisma.referralOffer.findUnique({ where: { id } });
    if (!offer) {
      throw new NotFoundException('Referral offer not found');
    }
    return offer;
  }

  private async ensureDraftOffer(id: string) {
    const offer = await this.ensureOffer(id);
    if (offer.status !== ReferralOfferStatus.DRAFT) {
      throw new BadRequestException('Only draft referral offers can be edited');
    }
    return offer;
  }

  private async ensureTier(id: string) {
    const tier = await this.prisma.referralRewardTier.findUnique({
      where: { id },
    });
    if (!tier) {
      throw new NotFoundException('Referral reward tier not found');
    }
    return tier;
  }

  private rethrow(error: unknown, fallback: string): never {
    if (error instanceof HttpException) {
      throw error;
    }
    throw new InternalServerErrorException(fallback);
  }
}
